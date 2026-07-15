import { Link } from "react-router-dom";

const PatientHomePage = () => {
  return (
    <div>
      <h1>PatientHomePage</h1>
      <p>환자 홈페이지</p>
      <Link to="/patient/daily">
        <button>일상모드</button>
      </Link>
      <Link to="/patient/confusion">
        <button>잘 모르겠어요</button>
      </Link>
      <Link to="/">이전으로 돌아가기</Link>
    </div>
  );
};

export default PatientHomePage;
