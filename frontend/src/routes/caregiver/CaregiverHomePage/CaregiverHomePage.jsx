import { Link } from "react-router-dom";

const CaregiverHomePage = () => {
  return (
    <div>
      <h1>CaregiverHomePage</h1>
      <p>보호자 홈페이지</p>
      <Link to="/roles">이전으로 돌아가기</Link>
    </div>
  );
};

export default CaregiverHomePage;
