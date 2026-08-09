import { useNavigate } from "react-router-dom";
import "./InstallGuidePage.css";

const installSteps = [
  {
    id: "share-button",
    title: "1. 하단 공유 버튼을 눌러주세요",
    description:
      "iPhone Safari에서 기억새록 페이지를 연 뒤, 화면 하단의 공유 버튼을 눌러주세요.",
    imageSrc: "/images/install-guide/step1.png",
    imageAlt: "iPhone Safari 하단 공유 버튼 클릭 안내",
  },
  {
    id: "more-button",
    title: "2. 더 보기 버튼을 눌러주세요",
    description: "공유 메뉴가 열리면 더 보기 버튼을 눌러주세요.",
    imageSrc: "/images/install-guide/step2.png",
    imageAlt: "iPhone Safari 공유 메뉴의 더 보기 버튼 안내",
  },
  {
    id: "add-to-home-screen",
    title: "3. 홈 화면에 추가를 선택해주세요",
    description:
      "목록에서 홈 화면에 추가를 선택하면 기억새록을 앱처럼 실행할 수 있습니다.",
    imageSrc: "/images/install-guide/step3.png",
    imageAlt: "iPhone Safari 홈 화면에 추가 버튼 안내",
  },
];

export default function InstallGuidePage() {
  const navigate = useNavigate();

  return (
    <main className="install-guide-page">
      <section className="install-guide-hero" aria-labelledby="install-title">
        <p className="install-guide-eyebrow">앱 다운로드 안내</p>

        <h1 id="install-title" className="install-guide-title">
          기억새록을 홈 화면에 추가해 주세요
        </h1>

        <p className="install-guide-description">
          iPhone에서는 앱 설치 버튼을 눌러도 자동으로 설치 창이 열리지 않습니다.
          아래 순서에 따라 Safari에서 홈 화면에 추가하면 기억새록을 앱처럼
          사용할 수 있습니다.
        </p>

        <div className="install-guide-actions">
          <button
            type="button"
            className="install-guide-secondary-button"
            onClick={() => navigate("/")}
          >
            처음 화면으로 돌아가기
          </button>

          <button
            type="button"
            className="install-guide-primary-button"
            onClick={() => navigate("/auth")}
          >
            로그인하고 체험하기
          </button>
        </div>
      </section>

      <section className="install-guide-steps" aria-label="iPhone 앱 설치 순서">
        {installSteps.map((step) => (
          <article className="install-guide-step" key={step.id}>
            <div className="install-guide-step-copy">
              <h2>{step.title}</h2>
              <p>{step.description}</p>
            </div>

            <div className="install-guide-image-frame">
              <img src={step.imageSrc} alt={step.imageAlt} />
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
