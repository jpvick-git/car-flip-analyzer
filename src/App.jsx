// src/App.jsx
import React, { useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import VehicleDetail from "./pages/VehicleDetail";
import SettingsPage from "./pages/Settings";
import Portfolio from "./pages/Portfolio";
import Header from "./components/Header";
import { UserSettingsProvider } from "./context/UserSettingsContext";
import { clearCachedSettings } from "./utils/userSettings";

// ProtectedRoute
function ProtectedRoute({ children }) {
  const token = localStorage.getItem("token");
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

// Layout wrapper
function Layout() {
  const location = useLocation();
  const navigate = useNavigate();

  const [showAddModal, setShowAddModal] = useState(false);
  const [showCSVModal, setShowCSVModal] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadComplete, setUploadComplete] = useState(false);

  const hideHeader =
    location.pathname === "/login" ||
    location.pathname === "/register" ||
    location.pathname.startsWith("/vehicle/");

  const isDemo = localStorage.getItem("is_demo") === "1";

  // Logout handler
  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("is_demo");
    clearCachedSettings();
    window.dispatchEvent(new Event("auth-changed"));
    navigate("/login");
  };

  // CSV upload function
  const uploadUserFile = async () => {
    if (!uploadFile) {
      alert("Please select a CSV file first!");
      return;
    }

    try {
      const formData = new FormData();
      formData.append("file", uploadFile);

      const response = await fetch(
        `${process.env.REACT_APP_API_BASE_URL || ""}/api/upload_file`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
          body: formData,
        }
      );

      if (response.ok) {
        setUploadFile(null);
        setShowCSVModal(false);
        setUploadComplete(true);
        setTimeout(() => setUploadComplete(false), 100);
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.detail || "Upload failed.");
      }
    } catch (err) {
      console.error(err);
      alert("Error uploading file.");
    }
  };

  return (
    <>
      {/* Header appears ONLY when logged in */}
      {!hideHeader && (
        <Header
          onAddVehicle={() => setShowAddModal(true)}
          onUploadCSV={() => setShowCSVModal(true)}
          uploadFile={uploadFile}
          setUploadFile={setUploadFile}
          uploadUserFile={uploadUserFile}
          logout={logout}
          isDemo={isDemo}
        />
      )}

      <Routes>
        {/* LOGIN / REGISTER */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* DASHBOARD */}
		<Route
		  path="/"
		  element={
			<ProtectedRoute>
			  <Dashboard
				showAddModal={showAddModal}
				setShowAddModal={setShowAddModal}
				showCSVModal={showCSVModal}
				setShowCSVModal={setShowCSVModal}
				uploadFile={uploadFile}
				setUploadFile={setUploadFile}
				uploadUserFile={uploadUserFile}
				uploadComplete={uploadComplete}
				isDemo={isDemo}
			  />
			</ProtectedRoute>
		  }
		/>
        {/* VEHICLE DETAIL */}
        <Route
          path="/vehicle/:id"
          element={
            <ProtectedRoute>
              <VehicleDetail />
            </ProtectedRoute>
          }
        />

        <Route
          path="/portfolio"
          element={
            <ProtectedRoute>
              <Portfolio />
            </ProtectedRoute>
          }
        />

        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsPage isDemo={isDemo} />
            </ProtectedRoute>
          }
        />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

// Main app root
export default function App() {
  return (
    <UserSettingsProvider>
      <Router>
        <Layout />
      </Router>
    </UserSettingsProvider>
  );
}
