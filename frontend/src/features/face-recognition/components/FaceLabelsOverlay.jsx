const FACE_LABEL_WIDTH = 260;

function getMemoryRecap(face) {
  return face.person.latest_memory?.recap || null;
}

function getDisplayName(person) {
  return `${person.relationship} ${person.name}`;
}

export default function FaceLabelsOverlay({ faces }) {
  if (!faces.length) {
    return null;
  }

  return (
    <div className="daily-mode-page__face-overlay" aria-hidden="true">
      {faces.map((face) => {
        const hasRoomOnRight =
          face.box.left + face.box.width + FACE_LABEL_WIDTH <
          face.box.elementWidth;
        const labelSideClass = hasRoomOnRight
          ? "daily-mode-page__face-box--label-right"
          : "daily-mode-page__face-box--label-left";
        const memoryRecap = getMemoryRecap(face);
        const memoryTitle = memoryRecap?.title || memoryRecap?.headline;

        return (
          <div
            className={`daily-mode-page__face-box ${labelSideClass}`}
            key={face.id}
            style={{
              left: `${face.box.left}px`,
              top: `${face.box.top}px`,
              width: `${face.box.width}px`,
              height: `${face.box.height}px`,
            }}
          >
            <div className="daily-mode-page__face-label">
              <strong>{getDisplayName(face.person)}</strong>

              {memoryRecap && (
                <div className="daily-mode-page__face-memory">
                  {memoryTitle && <b>📌 {memoryTitle}</b>}
                  {memoryRecap.summary && <p>{`"${memoryRecap.summary}"`}</p>}
                  {memoryRecap.upcoming_promise && (
                    <p className="daily-mode-page__face-memory-promise">
                      ⏰ [약속] {memoryRecap.upcoming_promise}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
