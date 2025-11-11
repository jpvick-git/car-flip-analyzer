// src/App.jsx
import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";

// -----------------------------------------------
// ProtectedRoute wrapper
// -----------------------------------------------
function ProtectedRoute({ children }) {
  const token = localStorage.getItem("token");

  // No token → redirect to login
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  // Token exists → render the requested page
  return children;
}

// -----------------------------------------------
// App entry point
// -----------------------------------------------
export default function App() {
  return (
    <Router>
      <Routes>
        {/* Public route: Login */}
        <Route path="/login" element={<Login />} />

        {/* Protected route: Dashboard */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        {/* Catch-all redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
