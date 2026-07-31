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
        const displayCard = getDisplayCard(face);
        const memoryRecap = getMemoryRecap(face);
        const cardTitle =
          displayCard?.title || memoryRecap?.title || memoryRecap?.headline;
        const cardBody = displayCard?.body || memoryRecap?.summary;
        const upcomingPromise =
          displayCard?.upcoming_promise || memoryRecap?.upcoming_promise;
        const longTermHint = displayCard?.long_term_hint;
        const suggestedQuestion = displayCard?.suggested_question;

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

              {(displayCard || memoryRecap) && (
                <div className="daily-mode-page__face-memory">
                  {cardTitle && <b>📌 {cardTitle}</b>}
                  {cardBody && <p>{`"${cardBody}"`}</p>}
                  {longTermHint && <p>{longTermHint}</p>}
                  {upcomingPromise && (
                    <p className="daily-mode-page__face-memory-promise">
                      ⏰ [약속] {upcomingPromise}
                    </p>
                  )}
                  {suggestedQuestion && (
                    <p className="daily-mode-page__face-memory-question">
                      💬 {suggestedQuestion}
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
