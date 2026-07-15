import { Link } from "react-router-dom";

const RoleSelectPage = () => {
  return (
    <div>
      <h1>RoleSelectPage</h1>
      <p>환자/보호자 선택 화면</p>
      <Link to="/patient">
        <button>환자</button>
      </Link>
      <Link to="/caregiver">
        <button>보호자</button>
      </Link>
    </div>
  );
};

export default RoleSelectPage;
