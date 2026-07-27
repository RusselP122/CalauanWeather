import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HomePage from './components/HomePage';
import Forecast from './components/Forecast';
import SpaghettiPlot from './components/SpaghettiPlot';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <div className="App">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/forecast" element={<Forecast />} />
          <Route path="/spaghetti" element={<SpaghettiPlot />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
