const FACE_LABEL_WIDTH = 260;

function getMemoryRecap(face) {
  return face.person.latest_memory?.recap || null;
}

function getDisplayCard(face) {
  return face.person.latest_summary?.card || null;
}

function getDisplayName(person) {
  return `${person.relationship} ${person.name}`;
}

export default function FaceLabelsOverlay({ faces, onOpenMemoryAlbum }) {
  if (!faces.length) {
    return null;
  }

  return (
    <div className="daily-mode-page__face-overlay">
      {faces.map((face) => {
        const hasRoomOnRight =
          face.box.left + face.box.width + FACE_LABEL_WIDTH <
          face.box.elementWidth;
        const labelSideClass = hasRoomOnRight
          ? "daily-mode-page__face-box--label-right"
          : "daily-mode-page__face-box--label-left";
        const displayCard = getDisplayCard(face);
        const memoryRecap = getMemoryRecap(face);
        const cardTitle =
          displayCard?.title || memoryRecap?.title || memoryRecap?.headline;
        const cardBody = displayCard?.body || memoryRecap?.summary;
        const upcomingPromise =
          displayCard?.upcoming_promise || memoryRecap?.upcoming_promise;
        const hasMemoryDetails = displayCard || memoryRecap;

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

              {onOpenMemoryAlbum && (
                <div className="daily-mode-page__face-memory">
                  {hasMemoryDetails && (
                    <>
                      {cardTitle && <b>📌 {cardTitle}</b>}
                      {cardBody && (
                        <p className="daily-mode-page__face-memory-body">
                          {`"${cardBody}"`}
                        </p>
                      )}
                      {upcomingPromise && (
                        <p className="daily-mode-page__face-memory-promise">
                          ⏰ [약속] {upcomingPromise}
                        </p>
                      )}
                    </>
                  )}
                  <button
                    className="daily-mode-page__face-memory-button"
                    type="button"
                    onClick={() => onOpenMemoryAlbum?.(face.person)}
                  >
                    추억 카드
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
