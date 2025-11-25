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
import Dashboard from "./pages/Dashboard";
import Header from "./components/Header";

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

  // 🔥 Add Vehicle Modal Controller
  const [showAddModal, setShowAddModal] = useState(false);

  // 🔥 CSV Upload Controller
  const [showCSVModal, setShowCSVModal] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);

  const hideHeader = location.pathname === "/login";

  // Logout handler
  const logout = () => {
    localStorage.removeItem("token");
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
        `${process.env.REACT_APP_API_BASE_URL || "https://api.carflipanalyzer.com"}/upload_file`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
          body: formData,
        }
      );

      if (response.ok) {
        alert("File uploaded successfully!");
        setUploadFile(null);
      } else {
        alert("Upload failed.");
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
        />
      )}

      <Routes>
        {/* LOGIN */}
        <Route path="/login" element={<Login />} />

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
              />
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
    <Router>
      <Layout />
    </Router>
  );
}
