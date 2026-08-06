import { useEffect, useRef } from "react";

const FACE_LABEL_WIDTH = 260;
const FACE_LABEL_GAP = 8;
const FACE_LABEL_SCREEN_MARGIN = 16;
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

function getLabelWidth(face) {
  return Math.min(
    FACE_LABEL_WIDTH,
    Math.max(0, face.box.elementWidth - FACE_LABEL_SCREEN_MARGIN * 2),
  );
}

function canShowLabelOnRight(face) {
  return (
    face.box.left +
      face.box.width +
      FACE_LABEL_GAP +
      getLabelWidth(face) <=
    face.box.elementWidth - FACE_LABEL_SCREEN_MARGIN
  );
}

function canShowLabelOnLeft(face) {
  return (
    face.box.left - FACE_LABEL_GAP - getLabelWidth(face) >=
    FACE_LABEL_SCREEN_MARGIN
  );
}

function getNextLabelSide(face, previousSide) {
  const rightFits = canShowLabelOnRight(face);
  const leftFits = canShowLabelOnLeft(face);

  if (!previousSide) {
    return rightFits || !leftFits ? "right" : "left";
  }

  if (previousSide === "right") {
    return rightFits || !leftFits ? "right" : "left";
  }

  return leftFits || !rightFits ? "left" : "right";
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

export default function FaceLabelsOverlay({ faces, onOpenMemoryAlbum }) {
  const labelSideByFaceRef = useRef(new Map());
  const boxByFaceRef = useRef(new Map());

  useEffect(() => {
    const visibleFaceIds = new Set(faces.map(getFaceIdentity));

    labelSideByFaceRef.current.forEach((_, faceId) => {
      if (!visibleFaceIds.has(faceId)) {
        labelSideByFaceRef.current.delete(faceId);
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
        const labelSide = getNextLabelSide(
          face,
          labelSideByFaceRef.current.get(faceIdentity),
        );
        const smoothedBox = getSmoothedBox(
          boxByFaceRef.current.get(faceIdentity),
          face.box,
        );

        labelSideByFaceRef.current.set(faceIdentity, labelSide);
        boxByFaceRef.current.set(faceIdentity, smoothedBox);

        const labelSideClass = labelSide === "right"
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
        const hasMemoryDetails = displayCard || memoryRecap;

        return (
          <div
            className={`daily-mode-page__face-box ${labelSideClass}`}
            key={faceIdentity}
            style={{
              left: `${smoothedBox.left}px`,
              top: `${smoothedBox.top}px`,
              width: `${smoothedBox.width}px`,
              height: `${smoothedBox.height}px`,
            }}
          >
            <div className="daily-mode-page__face-label">
              <strong>{getDisplayName(face.person)}</strong>

              {onOpenMemoryAlbum && (
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
