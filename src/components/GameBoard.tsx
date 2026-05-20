import { Chess } from 'chess.js';
import {
  Chessboard,
  type PieceDropHandlerArgs,
  type PieceHandlerArgs,
} from 'react-chessboard';
import type { BoardTurn, PlayerRole } from '../types/messages';

type GameBoardProps = {
  fen: string;
  role: PlayerRole;
  turn: BoardTurn;
  disabled: boolean;
  onMove: (from: string, to: string) => void;
};

export function GameBoard({ fen, role, turn, disabled, onMove }: GameBoardProps) {
  const orientation = role;
  const interactive = !disabled;

  function canDragPiece({ piece }: PieceHandlerArgs) {
    if (!interactive) {
      return false;
    }

    const playerTurn = role === 'white' ? 'w' : 'b';
    return playerTurn === turn && piece.pieceType.startsWith(playerTurn);
  }

  function handlePieceDrop({ sourceSquare, targetSquare }: PieceDropHandlerArgs) {
    if (!interactive || !targetSquare) {
      return false;
    }

    const chess = new Chess(fen);

    try {
      chess.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
    } catch {
      return false;
    }

    onMove(sourceSquare, targetSquare);
    return false;
  }

  return (
    <div className="board-shell">
      <Chessboard
        options={{
          position: fen,
          boardOrientation: orientation,
          allowDragging: interactive,
          canDragPiece,
          onPieceDrop: handlePieceDrop,
          animationDurationInMs: 120,
          darkSquareStyle: { backgroundColor: '#6d8a47' },
          lightSquareStyle: { backgroundColor: '#efe2bd' },
          boardStyle: {
            borderRadius: '0',
            boxShadow: 'none',
          },
        }}
      />
    </div>
  );
}
