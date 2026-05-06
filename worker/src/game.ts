import { Chess } from 'chess.js';
import type {
  BoardTurn,
  ClientMessage,
  ClockState,
  CreateGameResponse,
  GameId,
  GameInfoResponse,
  GameResult,
  GameSettings,
  GameStatus,
  JoinGameResponse,
  MoveRecord,
  PlayerColor,
  PlayerRole,
  PlayerToken,
  PublicGameState,
  PublicPlayers,
  ServerMessage,
} from './types';

type StoredPlayers = {
  white: PlayerToken | null;
  black: PlayerToken | null;
};

type StoredGame = {
  gameId: GameId;
  status: GameStatus;
  settings: GameSettings;
  players: StoredPlayers;
  spectators: PlayerToken[];
  fen: string;
  turn: BoardTurn;
  clocks: ClockState;
  turnStartedAt: number | null;
  moves: MoveRecord[];
  result: GameResult | null;
  drawOfferBy: PlayerColor | null;
  rematchOfferBy: PlayerColor | null;
  createdAt: number;
  updatedAt: number;
};

type CreateBody = {
  gameId: GameId;
  settings: GameSettings;
};

type SocketMessage = string | ArrayBuffer;

const gameKey = 'game';
const timeControls: Record<GameSettings['timeControl'], number | null> = {
  '5min': 5 * 60 * 1000,
  '10min': 10 * 60 * 1000,
  none: null,
};

export class ChessGame {
  private readonly state: DurableObjectState;
  private readonly sockets = new Map<PlayerToken, Set<WebSocket>>();

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/create' && request.method === 'POST') {
      return this.createGame(request);
    }

    if (url.pathname === '/join' && request.method === 'POST') {
      return this.joinGame();
    }

    if (url.pathname === '/info' && request.method === 'GET') {
      return this.getInfo();
    }

    if (url.pathname === '/ws' && request.headers.get('Upgrade') === 'websocket') {
      return this.connectSocket(request);
    }

    return json({ error: 'Route not found.' }, 404);
  }

  async alarm(): Promise<void> {
    const game = await this.loadGame();

    if (!game) {
      return;
    }

    const changed = this.applyClock(game, Date.now());

    if (changed) {
      await this.saveGame(game);
      this.broadcastState(game);
      return;
    }

    await this.scheduleAlarm(game);
  }

  private async createGame(request: Request): Promise<Response> {
    const existing = await this.loadGame();

    if (existing) {
      return json({ error: 'The game already exists.' }, 409);
    }

    const body = await readCreateBody(request);

    if (!body) {
      return json({ error: 'Invalid game settings.' }, 400);
    }

    const chess = new Chess();
    const creatorColor = resolveCreatorColor(body.settings.playerColor);
    const creatorToken = createToken();
    const now = Date.now();
    const initialClock = timeControls[body.settings.timeControl];
    const game: StoredGame = {
      gameId: body.gameId,
      status: 'waiting',
      settings: body.settings,
      players: {
        white: creatorColor === 'white' ? creatorToken : null,
        black: creatorColor === 'black' ? creatorToken : null,
      },
      spectators: [],
      fen: chess.fen(),
      turn: chess.turn(),
      clocks: { w: initialClock, b: initialClock },
      turnStartedAt: null,
      moves: [],
      result: null,
      drawOfferBy: null,
      rematchOfferBy: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.saveGame(game);

    const response: CreateGameResponse = {
      gameId: body.gameId,
      playerToken: creatorToken,
      role: creatorColor,
    };

    return json(response, 201);
  }

  private async joinGame(): Promise<Response> {
    const game = await this.loadGame();

    if (!game) {
      return json({ error: 'Game not found.' }, 404);
    }

    if (game.status === 'waiting') {
      const openColor = getOpenColor(game.players);

      if (openColor) {
        const playerToken = createToken();
        game.players[openColor] = playerToken;
        game.status = 'active';
        game.turnStartedAt = game.settings.timeControl === 'none' ? null : Date.now();
        await this.saveGame(game);
        await this.scheduleAlarm(game);
        this.broadcastState(game);

        const response: JoinGameResponse = {
          gameId: game.gameId,
          playerToken,
          role: openColor,
        };

        return json(response, 200);
      }
    }

    if (!game.settings.allowSpectators) {
      return json({ error: 'The game is full.' }, 409);
    }

    const playerToken = createToken();
    game.spectators.push(playerToken);
    await this.saveGame(game);

    const response: JoinGameResponse = {
      gameId: game.gameId,
      playerToken,
      role: 'spectator',
    };

    return json(response, 200);
  }

  private async getInfo(): Promise<Response> {
    const game = await this.loadGame();

    if (!game) {
      return json({ error: 'Game not found.' }, 404);
    }

    const response: GameInfoResponse = {
      gameId: game.gameId,
      status: game.status,
      settings: game.settings,
      players: {
        white: Boolean(game.players.white),
        black: Boolean(game.players.black),
      },
    };

    return json(response, 200);
  }

  private async connectSocket(request: Request): Promise<Response> {
    const game = await this.loadGame();

    if (!game) {
      return json({ error: 'Game not found.' }, 404);
    }

    const url = new URL(request.url);
    const token = url.searchParams.get('token');

    if (!token || !this.getRole(game, token)) {
      return json({ error: 'Invalid player token.' }, 401);
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    server.accept();
    this.addSocket(token, server);
    await this.expireIfNeeded(game);

    const freshGame = (await this.loadGame()) ?? game;
    this.sendState(server, freshGame, token);
    this.broadcastState(freshGame);

    server.addEventListener('message', (event) => {
      void this.handleSocketMessage(token, event.data);
    });
    server.addEventListener('close', () => {
      void this.removeSocket(token, server);
    });
    server.addEventListener('error', () => {
      void this.removeSocket(token, server);
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  private async handleSocketMessage(token: PlayerToken, data: SocketMessage): Promise<void> {
    if (typeof data !== 'string') {
      await this.sendError(token, 'Invalid message.');
      return;
    }

    const message = parseClientMessage(data);

    if (!message) {
      await this.sendError(token, 'Invalid message.');
      return;
    }

    if (message.type === 'move') {
      await this.handleMove(token, message);
      return;
    }

    if (message.type === 'resign') {
      await this.handleResign(token);
      return;
    }

    if (message.type === 'offer_draw') {
      await this.handleDrawOffer(token);
      return;
    }

    if (message.type === 'accept_draw') {
      await this.handleDrawAccept(token);
      return;
    }

    if (message.type === 'offer_rematch') {
      await this.handleRematchOffer(token);
      return;
    }

    await this.handleRematchAccept(token);
  }

  private async handleMove(token: PlayerToken, message: Extract<ClientMessage, { type: 'move' }>): Promise<void> {
    const game = await this.loadGame();

    if (!game) {
      await this.sendError(token, 'Game not found.');
      return;
    }

    const role = this.getRole(game, token);

    if (role !== 'white' && role !== 'black') {
      await this.sendError(token, 'Only a player can make a move.');
      return;
    }

    if (game.status !== 'active') {
      await this.sendError(token, 'The game is not active.');
      return;
    }

    if (colorToTurn(role) !== game.turn) {
      await this.sendError(token, 'It is not your turn.');
      return;
    }

    if (this.applyClock(game, Date.now())) {
      await this.saveGame(game);
      this.broadcastState(game);
      return;
    }

    const chess = new Chess(game.fen);
    let move: ReturnType<Chess['move']>;

    try {
      move = chess.move({ from: message.from, to: message.to, promotion: message.promotion });
    } catch {
      await this.sendError(token, 'Illegal move.');
      return;
    }

    if (!move) {
      await this.sendError(token, 'Illegal move.');
      return;
    }

    game.fen = chess.fen();
    game.turn = chess.turn();
    game.moves.push({
      from: move.from,
      to: move.to,
      san: move.san,
      fen: game.fen,
      color: role === 'white' ? 'w' : 'b',
    });
    game.drawOfferBy = null;
    game.rematchOfferBy = null;

    const result = getGameResult(chess);

    if (result) {
      game.status = 'finished';
      game.result = result;
      game.turnStartedAt = null;
    } else {
      game.turnStartedAt = game.settings.timeControl === 'none' ? null : Date.now();
    }

    await this.saveGame(game);
    await this.scheduleAlarm(game);
    this.broadcastState(game);
  }

  private async handleResign(token: PlayerToken): Promise<void> {
    const game = await this.loadGame();

    if (!game) {
      await this.sendError(token, 'Game not found.');
      return;
    }

    const role = this.getRole(game, token);

    if (role !== 'white' && role !== 'black') {
      await this.sendError(token, 'Only a player can resign.');
      return;
    }

    if (game.status !== 'active') {
      await this.sendError(token, 'The game is not active.');
      return;
    }

    game.status = 'finished';
    game.result = { winner: role === 'white' ? 'black' : 'white', reason: 'resignation' };
    game.rematchOfferBy = null;
    game.turnStartedAt = null;
    await this.saveGame(game);
    await this.scheduleAlarm(game);
    this.broadcastState(game);
  }

  private async handleDrawOffer(token: PlayerToken): Promise<void> {
    const game = await this.loadGame();

    if (!game) {
      await this.sendError(token, 'Game not found.');
      return;
    }

    const role = this.getRole(game, token);

    if (role !== 'white' && role !== 'black') {
      await this.sendError(token, 'Only a player can offer a draw.');
      return;
    }

    if (game.status !== 'active') {
      await this.sendError(token, 'The game is not active.');
      return;
    }

    game.drawOfferBy = role;
    await this.saveGame(game);
    this.broadcastState(game);
  }

  private async handleDrawAccept(token: PlayerToken): Promise<void> {
    const game = await this.loadGame();

    if (!game) {
      await this.sendError(token, 'Game not found.');
      return;
    }

    const role = this.getRole(game, token);

    if (role !== 'white' && role !== 'black') {
      await this.sendError(token, 'Only a player can accept a draw.');
      return;
    }

    if (game.status !== 'active' || !game.drawOfferBy || game.drawOfferBy === role) {
      await this.sendError(token, 'There is no valid draw offer to accept.');
      return;
    }

    game.status = 'finished';
    game.result = { winner: null, reason: 'draw' };
    game.drawOfferBy = null;
    game.rematchOfferBy = null;
    game.turnStartedAt = null;
    await this.saveGame(game);
    await this.scheduleAlarm(game);
    this.broadcastState(game);
  }

  private async handleRematchOffer(token: PlayerToken): Promise<void> {
    const game = await this.loadGame();

    if (!game) {
      await this.sendError(token, 'Game not found.');
      return;
    }

    const role = this.getRole(game, token);

    if (role !== 'white' && role !== 'black') {
      await this.sendError(token, 'Only a player can offer a rematch.');
      return;
    }

    if (game.status !== 'finished') {
      await this.sendError(token, 'A rematch can only be offered after the game.');
      return;
    }

    game.rematchOfferBy = role;
    await this.saveGame(game);
    this.broadcastState(game);
  }

  private async handleRematchAccept(token: PlayerToken): Promise<void> {
    const game = await this.loadGame();

    if (!game) {
      await this.sendError(token, 'Game not found.');
      return;
    }

    const role = this.getRole(game, token);

    if (role !== 'white' && role !== 'black') {
      await this.sendError(token, 'Only a player can accept a rematch.');
      return;
    }

    if (game.status !== 'finished' || !game.rematchOfferBy || game.rematchOfferBy === role) {
      await this.sendError(token, 'There is no valid rematch offer to accept.');
      return;
    }

    startRematch(game);
    await this.saveGame(game);
    await this.scheduleAlarm(game);
    this.broadcastState(game);
  }

  private async expireIfNeeded(game: StoredGame): Promise<void> {
    if (!this.applyClock(game, Date.now())) {
      return;
    }

    await this.saveGame(game);
    await this.scheduleAlarm(game);
  }

  private applyClock(game: StoredGame, now: number): boolean {
    if (game.status !== 'active' || game.turnStartedAt === null) {
      return false;
    }

    const remaining = game.clocks[game.turn];

    if (remaining === null) {
      return false;
    }

    const elapsed = Math.max(0, now - game.turnStartedAt);
    const nextRemaining = remaining - elapsed;
    game.clocks[game.turn] = Math.max(0, nextRemaining);
    game.turnStartedAt = now;

    if (nextRemaining > 0) {
      return false;
    }

    game.status = 'finished';
    game.result = {
      winner: game.turn === 'w' ? 'black' : 'white',
      reason: 'timeout',
    };
    game.turnStartedAt = null;
    return true;
  }

  private async scheduleAlarm(game: StoredGame): Promise<void> {
    if (game.status !== 'active' || game.turnStartedAt === null) {
      await this.state.storage.deleteAlarm();
      return;
    }

    const remaining = game.clocks[game.turn];

    if (remaining === null) {
      await this.state.storage.deleteAlarm();
      return;
    }

    await this.state.storage.setAlarm(game.turnStartedAt + remaining + 250);
  }

  private addSocket(token: PlayerToken, socket: WebSocket): void {
    const sockets = this.sockets.get(token) ?? new Set<WebSocket>();
    sockets.add(socket);
    this.sockets.set(token, sockets);
  }

  private async removeSocket(token: PlayerToken, socket: WebSocket): Promise<void> {
    const sockets = this.sockets.get(token);

    if (sockets) {
      sockets.delete(socket);

      if (sockets.size === 0) {
        this.sockets.delete(token);
      }
    }

    const game = await this.loadGame();

    if (game) {
      this.broadcastState(game);
    }
  }

  private removeSocketFromAllTokens(socket: WebSocket): void {
    for (const [token, sockets] of this.sockets) {
      sockets.delete(socket);

      if (sockets.size === 0) {
        this.sockets.delete(token);
      }
    }
  }

  private broadcastState(game: StoredGame): void {
    for (const [token, sockets] of this.sockets) {
      for (const socket of sockets) {
        this.sendState(socket, game, token);
      }
    }
  }

  private sendState(socket: WebSocket, game: StoredGame, token: PlayerToken): void {
    const role = this.getRole(game, token);

    if (!role) {
      return;
    }

    this.send(socket, { type: 'state', state: this.createPublicState(game, role) });
  }

  private async sendError(token: PlayerToken, message: string): Promise<void> {
    const sockets = this.sockets.get(token);

    if (!sockets) {
      return;
    }

    for (const socket of sockets) {
      this.send(socket, { type: 'error', message });
    }
  }

  private send(socket: WebSocket, message: ServerMessage): void {
    try {
      socket.send(JSON.stringify(message));
    } catch {
      this.removeSocketFromAllTokens(socket);
    }
  }

  private createPublicState(game: StoredGame, role: PlayerRole): PublicGameState {
    const now = Date.now();

    return {
      gameId: game.gameId,
      status: game.status,
      role,
      settings: game.settings,
      fen: game.fen,
      turn: game.turn,
      clocks: getVisibleClocks(game, now),
      turnStartedAt: game.turnStartedAt,
      moves: game.moves,
      players: this.getPublicPlayers(game),
      result: game.result,
      drawOfferBy: game.drawOfferBy,
      rematchOfferBy: game.rematchOfferBy ?? null,
      serverTime: now,
    };
  }

  private getPublicPlayers(game: StoredGame): PublicPlayers {
    return {
      white: Boolean(game.players.white),
      black: Boolean(game.players.black),
      whiteConnected: Boolean(game.players.white && this.sockets.get(game.players.white)?.size),
      blackConnected: Boolean(game.players.black && this.sockets.get(game.players.black)?.size),
    };
  }

  private getRole(game: StoredGame, token: PlayerToken): PlayerRole | null {
    if (game.players.white === token) {
      return 'white';
    }

    if (game.players.black === token) {
      return 'black';
    }

    if (game.spectators.includes(token)) {
      return 'spectator';
    }

    return null;
  }

  private async loadGame(): Promise<StoredGame | null> {
    return (await this.state.storage.get<StoredGame>(gameKey)) ?? null;
  }

  private async saveGame(game: StoredGame): Promise<void> {
    game.updatedAt = Date.now();
    await this.state.storage.put(gameKey, game);
  }
}

async function readCreateBody(request: Request): Promise<CreateBody | null> {
  let value: unknown;

  try {
    value = await request.json();
  } catch {
    return null;
  }

  if (!isRecord(value) || !isRecord(value.settings)) {
    return null;
  }

  if (typeof value.gameId !== 'string' || !isGameSettings(value.settings)) {
    return null;
  }

  return { gameId: value.gameId, settings: value.settings };
}

function parseClientMessage(data: string): ClientMessage | null {
  let value: unknown;

  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }

  if (!isRecord(value) || typeof value.type !== 'string') {
    return null;
  }

  if (value.type === 'move') {
    if (typeof value.from !== 'string' || typeof value.to !== 'string') {
      return null;
    }

    if (value.promotion !== undefined && !isPromotion(value.promotion)) {
      return null;
    }

    return { type: 'move', from: value.from, to: value.to, promotion: value.promotion };
  }

  if (
    value.type === 'resign' ||
    value.type === 'offer_draw' ||
    value.type === 'accept_draw' ||
    value.type === 'offer_rematch' ||
    value.type === 'accept_rematch'
  ) {
    return { type: value.type };
  }

  return null;
}

function getVisibleClocks(game: StoredGame, now: number): ClockState {
  const clocks = { ...game.clocks };

  if (game.status !== 'active' || game.turnStartedAt === null || clocks[game.turn] === null) {
    return clocks;
  }

  const remaining = clocks[game.turn];

  if (remaining === null) {
    return clocks;
  }

  clocks[game.turn] = Math.max(0, remaining - Math.max(0, now - game.turnStartedAt));
  return clocks;
}

function getGameResult(chess: Chess): GameResult | null {
  if (chess.isCheckmate()) {
    return {
      winner: chess.turn() === 'w' ? 'black' : 'white',
      reason: 'checkmate',
    };
  }

  if (chess.isStalemate()) {
    return { winner: null, reason: 'stalemate' };
  }

  if (chess.isDraw()) {
    return { winner: null, reason: 'draw' };
  }

  return null;
}

function startRematch(game: StoredGame): void {
  const chess = new Chess();
  const initialClock = timeControls[game.settings.timeControl];
  const previousWhite = game.players.white;

  game.players.white = game.players.black;
  game.players.black = previousWhite;
  game.status = 'active';
  game.fen = chess.fen();
  game.turn = chess.turn();
  game.clocks = { w: initialClock, b: initialClock };
  game.turnStartedAt = game.settings.timeControl === 'none' ? null : Date.now();
  game.moves = [];
  game.result = null;
  game.drawOfferBy = null;
  game.rematchOfferBy = null;
}

function getOpenColor(players: StoredPlayers): PlayerColor | null {
  if (!players.white) {
    return 'white';
  }

  if (!players.black) {
    return 'black';
  }

  return null;
}

function resolveCreatorColor(choice: GameSettings['playerColor']): PlayerColor {
  if (choice === 'random') {
    return Math.random() < 0.5 ? 'white' : 'black';
  }

  return choice;
}

function colorToTurn(color: PlayerColor): BoardTurn {
  return color === 'white' ? 'w' : 'b';
}

function createToken(): PlayerToken {
  return crypto.randomUUID().replaceAll('-', '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isGameSettings(value: unknown): value is GameSettings {
  if (!isRecord(value)) {
    return false;
  }

  return (
    (value.timeControl === '5min' || value.timeControl === '10min' || value.timeControl === 'none') &&
    (value.playerColor === 'white' || value.playerColor === 'black' || value.playerColor === 'random') &&
    typeof value.allowSpectators === 'boolean'
  );
}

function isPromotion(value: unknown): value is NonNullable<Extract<ClientMessage, { type: 'move' }>['promotion']> {
  return value === 'q' || value === 'r' || value === 'b' || value === 'n';
}

function json<TBody>(body: TBody, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
