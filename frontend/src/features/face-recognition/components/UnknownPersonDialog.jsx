import { useEffect, useState } from "react";

export default function UnknownPersonDialog({
  open,
  isSaving,
  errorMessage,
  onClose,
  onSubmit,
}) {
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [coreMemory, setCoreMemory] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
      setRelationship("");
      setCoreMemory("");
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!name.trim() || !relationship.trim()) {
      return;
    }

    onSubmit({
      name: name.trim(),
      relationship: relationship.trim(),
      coreMemory: coreMemory.trim(),
    });
  };

  return (
    <div className="daily-mode-page__dialog-backdrop" role="presentation">
      <form className="daily-mode-page__dialog" onSubmit={handleSubmit}>
        <h2>모르는 사람입니다. 새로 추가하시겠어요?</h2>

        <label>
          이름
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="예: 김민수"
          />
        </label>

        <label>
          관계
          <input
            value={relationship}
            onChange={(event) => setRelationship(event.target.value)}
            placeholder="예: 아들, 담당 의사"
          />
        </label>

        <label>
          핵심 기억
          <textarea
            value={coreMemory}
            onChange={(event) => setCoreMemory(event.target.value)}
            placeholder="예: 삼성전자에 다니며 최근 딸을 낳았음"
            rows={3}
          />
        </label>

        {errorMessage && (
          <p className="daily-mode-page__dialog-error">{errorMessage}</p>
        )}

        <div className="daily-mode-page__dialog-actions">
          <button type="button" onClick={onClose} disabled={isSaving}>
            나중에
          </button>
          <button
            type="submit"
            disabled={isSaving || !name.trim() || !relationship.trim()}
          >
            {isSaving ? "저장 중" : "추가하기"}
          </button>
        </div>
      </form>
    </div>
  );
}
