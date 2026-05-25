// api.js
// handles talking to my Express backend

import { analyzeTextLocally } from './textProcessing.js'; // local fallback

const API_URL = 'http://localhost:3000'; // TODO: change to the actual API URL when hosted


// sends text to the backend for analysis -> I call my own api
export async function analyzeText(text, settings = {}) {
  let density = settings.density;
  if (density === undefined) {
    density = 1;
  }
  if (density > 1) density = 1;
  if (density < 0) density = 0;

  try {
    const response = await fetch(`${API_URL}/api/analyze-text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: text,
        density: density
      })
    });

    if (!response.ok) {
      throw new Error('Echo API failed: ' + response.status);
    }

    const data = await response.json();
    return data;

  } catch (error) {
    console.log('could not analyze text, using local fallback');
    console.log(error);
    return analyzeTextLocally(text, density);
  }
}


// saves a work to the gallery
export async function saveWork(work) {
  try {
    const response = await fetch(`${API_URL}/api/works`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(work)
    });

    return await response.json();

  } catch (error) {
    console.log('could not save work');
    console.log(error);
  }
}


// gets all saved works
export async function fetchWorks() {
  try {
    const response = await fetch(`${API_URL}/api/works`);
    return await response.json();

  } catch (error) {
    console.log('could not load gallery');
    console.log(error);
  }
}


// gets one work by id
export async function fetchWork(id) {
  try {
    const response = await fetch(`${API_URL}/api/works/${id}`);
    return await response.json();

  } catch (error) {
    console.log('could not load work');
    console.log(error);
  }
}


// deletes a work
export async function deleteWork(id) {
  try {
    const response = await fetch(`${API_URL}/api/works/${id}`, {
      method: 'DELETE'
    });

    return await response.json();

  } catch (error) {
    console.log('could not delete work');
    console.log(error);
  }
}