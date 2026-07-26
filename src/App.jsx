import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Forecast from './components/Forecast';
import SpaghettiPlot from './components/SpaghettiPlot';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <div className="App">
        <Routes>
          <Route path="/" element={<Forecast />} />
          <Route path="/spaghetti" element={<SpaghettiPlot />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
