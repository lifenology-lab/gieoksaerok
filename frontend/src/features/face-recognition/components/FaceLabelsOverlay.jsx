import { useEffect, useRef } from "react";

const FACE_LABEL_WIDTH = 260;
const FACE_LABEL_GAP = 8;
const FACE_LABEL_SCREEN_MARGIN = 16;
const FACE_LABEL_MAX_HEIGHT = 260;
const FACE_BOX_SMOOTHING_FACTOR = 0.35;
const FACE_BOX_SNAP_DISTANCE = 140;

function getMemoryRecap(face) {
  return face.person.latest_memory?.recap || null;
}

function getDisplayCard(face) {
  return face.person.latest_summary?.card || null;
}

function getDisplayName(person) {
  return `${person.relationship} ${person.name}`;
}

function getFaceIdentity(face) {
  return face.person?.id || face.id;
}

function getLabelWidth(box) {
  return Math.min(
    FACE_LABEL_WIDTH,
    Math.max(0, box.elementWidth - FACE_LABEL_SCREEN_MARGIN * 2),
  );
}

function getLabelHeight(box) {
  return Math.min(
    FACE_LABEL_MAX_HEIGHT,
    Math.max(0, box.elementHeight - FACE_LABEL_SCREEN_MARGIN * 2),
  );
}

function getLabelTopOffset(box) {
  const labelHeight = getLabelHeight(box);
  const desiredTop = box.top + box.height / 2 - labelHeight / 2;
  const maxTop = Math.max(
    FACE_LABEL_SCREEN_MARGIN,
    box.elementHeight - FACE_LABEL_SCREEN_MARGIN - labelHeight,
  );
  const labelTop = Math.min(
    Math.max(FACE_LABEL_SCREEN_MARGIN, desiredTop),
    maxTop,
  );

  return labelTop - box.top;
}

function getBoxCenter(box) {
  return {
    x: box.left + box.width / 2,
    y: box.top + box.height / 2,
  };
}

function shouldSnapBox(previousBox, nextBox) {
  if (
    !previousBox ||
    previousBox.elementWidth !== nextBox.elementWidth ||
    previousBox.elementHeight !== nextBox.elementHeight
  ) {
    return true;
  }

  const previousCenter = getBoxCenter(previousBox);
  const nextCenter = getBoxCenter(nextBox);
  const distance = Math.hypot(
    nextCenter.x - previousCenter.x,
    nextCenter.y - previousCenter.y,
  );

  return distance > FACE_BOX_SNAP_DISTANCE;
}

function getSmoothedBox(previousBox, nextBox) {
  if (shouldSnapBox(previousBox, nextBox)) {
    return nextBox;
  }

  const smooth = (previousValue, nextValue) =>
    previousValue + (nextValue - previousValue) * FACE_BOX_SMOOTHING_FACTOR;

  return {
    ...nextBox,
    left: smooth(previousBox.left, nextBox.left),
    top: smooth(previousBox.top, nextBox.top),
    width: smooth(previousBox.width, nextBox.width),
    height: smooth(previousBox.height, nextBox.height),
  };
}

function getLabelLeftOffset(box) {
  const labelWidth = getLabelWidth(box);
  const desiredLeft = box.left + box.width + FACE_LABEL_GAP;
  const maxLeft = Math.max(
    FACE_LABEL_SCREEN_MARGIN,
    box.elementWidth - FACE_LABEL_SCREEN_MARGIN - labelWidth,
  );
  const labelLeft = Math.min(
    Math.max(FACE_LABEL_SCREEN_MARGIN, desiredLeft),
    maxLeft,
  );

  return labelLeft - box.left;
}

export default function FaceLabelsOverlay({
  faces,
  onOpenMemoryAlbum,
  renderFaceActions,
}) {
  const boxByFaceRef = useRef(new Map());

  useEffect(() => {
    const visibleFaceIds = new Set(faces.map(getFaceIdentity));

    boxByFaceRef.current.forEach((_, faceId) => {
      if (!visibleFaceIds.has(faceId)) {
        boxByFaceRef.current.delete(faceId);
      }
    });
  }, [faces]);

  if (!faces.length) {
    return null;
  }

  return (
    <div className="daily-mode-page__face-overlay">
      {faces.map((face) => {
        const faceIdentity = getFaceIdentity(face);
        const smoothedBox = getSmoothedBox(
          boxByFaceRef.current.get(faceIdentity),
          face.box,
        );

        boxByFaceRef.current.set(faceIdentity, smoothedBox);

        const labelHeight = getLabelHeight(smoothedBox);
        const labelLeftOffset = getLabelLeftOffset(smoothedBox);
        const labelTopOffset = getLabelTopOffset(smoothedBox);
        const displayCard = getDisplayCard(face);
        const memoryRecap = getMemoryRecap(face);
        const cardTitle =
          displayCard?.title || memoryRecap?.title || memoryRecap?.headline;
        const cardBody = displayCard?.body || memoryRecap?.summary;
        const upcomingPromise =
          displayCard?.upcoming_promise || memoryRecap?.upcoming_promise;
        const longTermHint = displayCard?.long_term_hint;
        const hasMemoryDetails = displayCard || memoryRecap;
        const faceActions = renderFaceActions?.(face.person);

        return (
          <div
            className="daily-mode-page__face-box"
            key={faceIdentity}
            style={{
              left: `${smoothedBox.left}px`,
              top: `${smoothedBox.top}px`,
              width: `${smoothedBox.width}px`,
              height: `${smoothedBox.height}px`,
              "--face-label-left": `${labelLeftOffset}px`,
              "--face-label-max-height": `${labelHeight}px`,
              "--face-label-top": `${labelTopOffset}px`,
            }}
          >
            <div className="daily-mode-page__face-label">
              <strong>{getDisplayName(face.person)}</strong>

              {(onOpenMemoryAlbum || faceActions) && (
                <div className="daily-mode-page__face-memory">
                  {hasMemoryDetails && (
                    <>
                      {cardTitle && <b>📌 {cardTitle}</b>}
                      {cardBody && <p>{`"${cardBody}"`}</p>}
                      {longTermHint && <p>{longTermHint}</p>}
                      {upcomingPromise && (
                        <p className="daily-mode-page__face-memory-promise">
                          ⏰ [약속] {upcomingPromise}
                        </p>
                      )}
                    </>
                  )}

                  {onOpenMemoryAlbum && (
                    <button
                      className="daily-mode-page__face-memory-button"
                      type="button"
                      onClick={() => onOpenMemoryAlbum?.(face.person)}
                    >
                      추억 카드
                    </button>
                  )}

                  {faceActions && (
                    <div className="daily-mode-page__face-card-actions">
                      {faceActions}
                    </div>
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
