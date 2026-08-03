import "./App.css";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "./features/auth/components/AuthRoutes";
import { AuthProvider } from "./features/auth/context/AuthContext";
import AuthPage from "./routes/AuthPage/AuthPage";
import RoleSelectPage from "./routes/RoleSelectPage/RoleSelectPage";
import PatientHomePage from "./routes/patient/PatientHomePage/PatientHomePage";
import CaregiverHomePage from "./routes/caregiver/CaregiverHomePage/CaregiverHomePage";
import DailyModePage from "./routes/patient/DailyModePage/DailyModePage";
import ConfusionSelectPage from "./routes/patient/ConfusionSelectPage/ConfusionSelectPage";
import MemoryAlbumPage from "./routes/patient/MemoryAlbumPage/MemoryAlbumPage";

function protectedPage(element) {
  return <ProtectedRoute>{element}</ProtectedRoute>;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<AuthPage />}></Route>
          <Route
            path="/roles"
            element={protectedPage(<RoleSelectPage />)}
          ></Route>
          <Route
            path="/patient"
            element={protectedPage(<PatientHomePage />)}
          ></Route>
          <Route
            path="/patient/daily"
            element={protectedPage(<DailyModePage />)}
          ></Route>
          <Route
            path="/patient/confusion"
            element={protectedPage(<ConfusionSelectPage />)}
          ></Route>
          <Route
            path="/patient/memory-album/:personId"
            element={protectedPage(<MemoryAlbumPage />)}
          ></Route>
          <Route
            path="/caregiver"
            element={protectedPage(<CaregiverHomePage />)}
          ></Route>
          <Route path="*" element={<Navigate to="/" replace />}></Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
