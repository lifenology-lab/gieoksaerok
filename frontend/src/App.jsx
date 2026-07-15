import "./App.css";
import RoleSelectPage from "./routes/RoleSelectPage/RoleSelectPage";
import PatientHomePage from "./routes/patient/PatientHomePage/PatientHomePage";
import CaregiverHomePage from "./routes/caregiver/CaregiverHomePage/CaregiverHomePage";
import DailyModePage from "./routes/patient/DailyModePage/DailyModePage";
import ConfusionSelectPage from "./routes/patient/ConfusionSelectPage/ConfusionSelectPage";
import { BrowserRouter, Route, Routes } from "react-router-dom";

function App() {
  return (
    <BrowserRouter>
      <div>
        <Routes>
          <Route path="/" element={<RoleSelectPage></RoleSelectPage>}></Route>
          <Route
            path="/patient"
            element={<PatientHomePage></PatientHomePage>}
          ></Route>
          <Route
            path="/patient/daily"
            element={<DailyModePage></DailyModePage>}
          ></Route>
          <Route
            path="/patient/confusion"
            element={<ConfusionSelectPage></ConfusionSelectPage>}
          ></Route>
          <Route
            path="/caregiver"
            element={<CaregiverHomePage></CaregiverHomePage>}
          ></Route>
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
