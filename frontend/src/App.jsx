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
          <Route path="/" element={<RoleSelectPage />} />
          <Route path="/patient" element={<PatientHomePage />} />
          <Route path="/patient/daily" element={<DailyModePage />} />
          <Route path="/patient/confusion" element={<ConfusionSelectPage />} />
          <Route path="/caregiver" element={<CaregiverHomePage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
