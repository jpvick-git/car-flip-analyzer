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

// -----------------------------------------------
// ProtectedRoute wrapper
// -----------------------------------------------
function ProtectedRoute({ children }) {
  const token = localStorage.getItem("token");
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

// -----------------------------------------------
// Layout wrapper (Header + Routes)
// -----------------------------------------------
function Layout() {
  const location = useLocation();
  const navigate = useNavigate();

  const [uploadFile, setUploadFile] = useState(null);

  const hideHeader = location.pathname === "/login";

  // --- Logout handler ---
  const logout = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };

  // --- Upload handler ---
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
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          body: formData,
        }
      );

      if (response.ok) {
        alert("✅ File uploaded successfully!");
        setUploadFile(null);
      } else {
        alert("❌ Upload failed. Check your file and try again.");
      }
    } catch (err) {
      console.error("Upload error:", err);
      alert("⚠️ Error uploading file. Please try again.");
    }
  };

  return (
    <>
      {!hideHeader && (
        <Header
          uploadFile={uploadFile}
          setUploadFile={setUploadFile}
          uploadUserFile={uploadUserFile}
          logout={logout}
        />
      )}

      <Routes>
        {/* Login */}
        <Route path="/login" element={<Login />} />

        {/* Dashboard (Protected) */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

// -----------------------------------------------
// Main App
// -----------------------------------------------
export default function App() {
  return (
    <Router>
      <Layout />
    </Router>
  );
}
