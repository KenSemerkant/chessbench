const PIECES = [
  { code: "q", glyph: "♕", name: "Queen" },
  { code: "r", glyph: "♖", name: "Rook" },
  { code: "b", glyph: "♗", name: "Bishop" },
  { code: "n", glyph: "♘", name: "Knight" },
];

interface PromotionPickerProps {
  mover: "white" | "black";
  onChoose: (piece: string) => void;
  onCancel: () => void;
}

/** Promotion choice is mandatory — there is no auto-queen default. */
export function PromotionPicker({ mover, onChoose, onCancel }: PromotionPickerProps): JSX.Element {
  return (
    <div className="promotion-overlay" role="dialog" aria-label="Choose promotion piece">
      <div className="promotion-box">
        <p>Promote to ({mover} to move):</p>
        <div className="promotion-pieces">
          {PIECES.map((p) => (
            <button key={p.code} type="button" aria-label={p.name} onClick={() => onChoose(p.code)}>
              {p.glyph}
            </button>
          ))}
        </div>
        <button type="button" className="link" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
