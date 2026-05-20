export type GameId = string;
export type PlayerToken = string;
export type PlayerColor = 'white' | 'black';
export type BoardTurn = 'w' | 'b';
export type GameStatus = 'waiting' | 'active' | 'finished';
export type PlayerRole = PlayerColor;
export type TimeControl = '5min' | '10min' | 'none';
export type ColorChoice = PlayerColor | 'random';

export type GameSettings = {
  timeControl: TimeControl;
  playerColor: ColorChoice;
};

export type GameResult = {
  winner: PlayerColor | null;
  reason: 'checkmate' | 'stalemate' | 'draw' | 'resignation' | 'timeout';
};

export type ClockState = {
  w: number | null;
  b: number | null;
};

export type MoveRecord = {
  from: string;
  to: string;
  san: string;
  fen: string;
  color: BoardTurn;
};

export type PublicPlayers = {
  white: boolean;
  black: boolean;
  whiteConnected: boolean;
  blackConnected: boolean;
};

export type PublicGameState = {
  gameId: GameId;
  status: GameStatus;
  role: PlayerRole;
  settings: GameSettings;
  fen: string;
  turn: BoardTurn;
  clocks: ClockState;
  turnStartedAt: number | null;
  moves: MoveRecord[];
  players: PublicPlayers;
  result: GameResult | null;
  drawOfferBy: PlayerColor | null;
  rematchOfferBy: PlayerColor | null;
  serverTime: number;
};

export type CreateGameRequest = GameSettings;

export type CreateGameResponse = {
  gameId: GameId;
  playerToken: PlayerToken;
  role: PlayerColor;
};

export type JoinGameResponse = {
  gameId: GameId;
  playerToken: PlayerToken;
  role: PlayerColor;
};

export type GameInfoResponse = {
  gameId: GameId;
  status: GameStatus;
  settings: GameSettings;
  players: Pick<PublicPlayers, 'white' | 'black'>;
};

export type ApiErrorResponse = {
  error: string;
};

export type ClientMessage =
  | { type: 'move'; from: string; to: string; promotion?: 'q' | 'r' | 'b' | 'n' }
  | { type: 'resign' }
  | { type: 'offer_draw' }
  | { type: 'accept_draw' }
  | { type: 'offer_rematch' }
  | { type: 'accept_rematch' };

export type ServerMessage =
  | { type: 'state'; state: PublicGameState }
  | { type: 'error'; message: string };
