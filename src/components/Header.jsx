import React, { useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";

export default function App() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCSVModal, setShowCSVModal] = useState(false);

  const logout = () => {
    localStorage.removeItem("token");
    window.location.href = "/login";
  };

  const isLoggedIn = !!localStorage.getItem("token");

  return (
    <Router>
      {/* Header Always Visible When Logged In */}
      {isLoggedIn && (
        <Header
          onAddVehicle={() => setShowAddModal(true)}
          onUploadCSV={() => setShowCSVModal(true)}
          logout={logout}
        />
      )}

      {/* Main Content */}
      <div className="bg-white min-h-screen pt-4">
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/"
            element={
              isLoggedIn ? (
                <Dashboard
                  showAddModal={showAddModal}
                  setShowAddModal={setShowAddModal}
                  showCSVModal={showCSVModal}
                  setShowCSVModal={setShowCSVModal}
                />
              ) : (
                <Navigate to="/login" />
              )
            }
          />
        </Routes>
      </div>
    </Router>
  );
}
