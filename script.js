class GestureRecognizer {
  constructor() {
    this.isRecording = false;
    this.currentGesture = [];
    this.gestureLibrary = new Map();
    this.matchResult = null;
    this.TARGET_POINTS = 50; // Constant for resampling

    // DOM Elements
    this.canvas = document.getElementById('gestureCanvas');
    this.context = this.canvas.getContext('2d');
    this.gestureNameInput = document.getElementById('gestureName');
    this.saveButton = document.getElementById('saveButton');
    this.recognizeButton = document.getElementById('recognizeButton');
    this.clearButton = document.getElementById('clearButton');
    this.savedCount = document.getElementById('savedCount');
    this.gestureList = document.getElementById('gestureList');
    this.matchResultElement = document.getElementById('matchResult');

    // Initialize canvas
    this.initializeCanvas();

    // Bind event listeners
    this.bindEventListeners();
  }

  initializeCanvas() {
    this.canvas.width = 400;
    this.canvas.height = 300;
    this.context.strokeStyle = '#000000';
    this.context.lineWidth = 2;
    this.context.lineCap = 'round';
  }

  bindEventListeners() {
    this.canvas.addEventListener('mousedown', this.startRecording.bind(this));
    this.canvas.addEventListener('mousemove', this.recordGesture.bind(this));
    this.canvas.addEventListener('mouseup', this.stopRecording.bind(this));
    this.canvas.addEventListener('mouseleave', this.stopRecording.bind(this));

    this.saveButton.addEventListener('click', this.saveGesture.bind(this));
    this.recognizeButton.addEventListener('click', this.recognizeGesture.bind(this));
    this.clearButton.addEventListener('click', this.clearCanvas.bind(this));
  }

  startRecording(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    this.isRecording = true;
    this.currentGesture = [[x, y]];
    this.context.beginPath();
    this.context.moveTo(x, y);
  }

  recordGesture(e) {
    if (!this.isRecording) return;

    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    this.currentGesture.push([x, y]);
    this.context.lineTo(x, y);
    this.context.stroke();
  }

  stopRecording() {
    this.isRecording = false;
    this.updateButtonStates();
  }

  normalizeGesture(gesture) {
    if (gesture.length === 0) return gesture;

    const xs = gesture.map(p => p[0]);
    const ys = gesture.map(p => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const width = maxX - minX || 1;
    const height = maxY - minY || 1;
    const scale = Math.max(width, height);

    return gesture.map(([x, y]) => [
      (x - minX) / scale,
      (y - minY) / scale
    ]);
  }

  resampleGesture(gesture, targetLength) {
    if (gesture.length === 0) return [];
    if (gesture.length === 1) return Array(targetLength).fill(gesture[0]);

    const resampled = [gesture[0]];
    let totalLength = 0;

    for (let i = 1; i < gesture.length; i++) {
      const dx = gesture[i][0] - gesture[i - 1][0];
      const dy = gesture[i][1] - gesture[i - 1][1];
      totalLength += Math.sqrt(dx * dx + dy * dy);
    }

    const stepSize = totalLength / (targetLength - 1);
    let currentLength = 0;
    let currentPoint = 0;

    while (resampled.length < targetLength && currentPoint < gesture.length - 1) {
      const p1 = gesture[currentPoint];
      const p2 = gesture[currentPoint + 1];
      const dx = p2[0] - p1[0];
      const dy = p2[1] - p1[1];
      const segmentLength = Math.sqrt(dx * dx + dy * dy);

      if (currentLength + segmentLength >= stepSize * resampled.length) {
        const t = (stepSize * resampled.length - currentLength) / segmentLength;
        resampled.push([
          p1[0] + dx * t,
          p1[1] + dy * t
        ]);
      } else {
        currentLength += segmentLength;
        currentPoint++;
      }
    }

    while (resampled.length < targetLength) {
      resampled.push(gesture[gesture.length - 1]);
    }

    return resampled;
  }

  calculateAverageGesture(examples) {
    if (!examples || examples.length === 0) return null;

    // First normalize and resample all examples to have the same number of points
    const processedExamples = examples.map(example => {
      const normalized = this.normalizeGesture(example);
      return this.resampleGesture(normalized, this.TARGET_POINTS);
    });

    // Calculate the average position for each point
    const averageGesture = new Array(this.TARGET_POINTS);
    const variances = new Array(this.TARGET_POINTS);

    for (let i = 0; i < this.TARGET_POINTS; i++) {
      let sumX = 0;
      let sumY = 0;
      let sumSquaredX = 0;
      let sumSquaredY = 0;

      processedExamples.forEach(example => {
        sumX += example[i][0];
        sumY += example[i][1];
        sumSquaredX += example[i][0] * example[i][0];
        sumSquaredY += example[i][1] * example[i][1];
      });

      const avgX = sumX / examples.length;
      const avgY = sumY / examples.length;

      // Calculate variance for this point
      const varX = (sumSquaredX / examples.length) - (avgX * avgX);
      const varY = (sumSquaredY / examples.length) - (avgY * avgY);

      averageGesture[i] = [avgX, avgY];
      variances[i] = [Math.max(0.01, varX), Math.max(0.01, varY)]; // Minimum variance to prevent division by zero
    }

    return { averageGesture, variances };
  }

  calculateSimilarityToModel(gesture, gestureModel) {
    const normalized = this.normalizeGesture(gesture);
    const resampled = this.resampleGesture(normalized, this.TARGET_POINTS);

    const { averageGesture, variances } = gestureModel;

    let totalScore = 0;
    for (let i = 0; i < this.TARGET_POINTS; i++) {
      const [x, y] = resampled[i];
      const [avgX, avgY] = averageGesture[i];
      const [varX, varY] = variances[i];

      // Calculate Mahalanobis-inspired distance (considering variance)
      const dx = (x - avgX) * (x - avgX) / varX;
      const dy = (y - avgY) * (y - avgY) / varY;

      // Convert distance to similarity score (0 to 1)
      const pointScore = 1 / (1 + Math.sqrt(dx + dy));
      totalScore += pointScore;
    }

    // Normalize the final score
    return totalScore / this.TARGET_POINTS;
  }

  saveGesture() {
    if (this.currentGesture.length > 1) {
      const name = this.gestureNameInput.value.trim();
      if (!name) {
        alert('Please enter a gesture name');
        return;
      }

      if (!this.gestureLibrary.has(name)) {
        this.gestureLibrary.set(name, []);
      }

      this.gestureLibrary.get(name).push(this.currentGesture);
      this.updateGestureList();
      this.clearCanvas();
    }
  }

  recognizeGesture() {
    if (this.currentGesture.length < 2 || this.gestureLibrary.size === 0) return;

    let bestMatch = 0;
    let bestGestureName = null;

    for (const [gestureName, examples] of this.gestureLibrary.entries()) {
      // Calculate the gesture model for this category
      const gestureModel = this.calculateAverageGesture(examples);
      if (!gestureModel) continue;

      // Calculate similarity using the model
      const similarity = this.calculateSimilarityToModel(this.currentGesture, gestureModel);

      if (similarity > bestMatch) {
        bestMatch = similarity;
        bestGestureName = gestureName;
      }
    }

    this.displayMatchResult(bestGestureName, bestMatch);
  }

  clearCanvas() {
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.currentGesture = [];
    this.matchResultElement.textContent = '';
    this.updateButtonStates();
  }

  deleteGesture(name, exampleIndex) {
    const examples = this.gestureLibrary.get(name);
    if (examples) {
      examples.splice(exampleIndex, 1);
      if (examples.length === 0) {
        this.gestureLibrary.delete(name);
      }
      this.updateGestureList();
    }
  }

  deleteGestureCategory(name) {
    this.gestureLibrary.delete(name);
    this.updateGestureList();
  }

  updateGestureName(oldName, newName) {
    if (oldName === newName) return;

    if (this.gestureLibrary.has(newName)) {
      alert('A gesture with this name already exists');
      return;
    }

    const examples = this.gestureLibrary.get(oldName);
    this.gestureLibrary.delete(oldName);
    this.gestureLibrary.set(newName, examples);
    this.updateGestureList();
  }

  updateButtonStates() {
    this.saveButton.disabled = this.currentGesture.length < 2;
    this.recognizeButton.disabled = this.currentGesture.length < 2 || this.gestureLibrary.size === 0;
  }

  updateGestureList() {
    this.savedCount.textContent = `Saved gestures: ${Array.from(this.gestureLibrary.values()).reduce((sum, examples) => sum + examples.length, 0)}`;
    this.gestureList.innerHTML = '';

    for (const [gestureName, examples] of this.gestureLibrary.entries()) {
      const categoryDiv = document.createElement('div');
      categoryDiv.className = 'gesture-category';

      const header = document.createElement('div');
      header.className = 'gesture-category-header';

      const nameSpan = document.createElement('span');
      nameSpan.textContent = `${gestureName} (${examples.length} examples)`;

      const editButton = document.createElement('button');
      editButton.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>';
      editButton.onclick = () => this.startEditing(categoryDiv, gestureName);

      const deleteButton = document.createElement('button');
      deleteButton.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"></path></svg>';
      deleteButton.onclick = () => this.deleteGestureCategory(gestureName);

      header.appendChild(nameSpan);
      header.appendChild(editButton);
      header.appendChild(deleteButton);
      categoryDiv.appendChild(header);

      const examplesList = document.createElement('div');
      examplesList.className = 'examples-list';

      examples.forEach((_, index) => {
        const exampleItem = document.createElement('div');
        exampleItem.className = 'example-item';

        const exampleSpan = document.createElement('span');
        exampleSpan.textContent = `Example ${index + 1}`;

        const deleteExampleButton = document.createElement('button');
        deleteExampleButton.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"></path></svg>';
        deleteExampleButton.onclick = (e) => {
          e.stopPropagation();
          this.deleteGesture(gestureName, index);
        };

        exampleItem.appendChild(exampleSpan);
        exampleItem.appendChild(deleteExampleButton);
        examplesList.appendChild(exampleItem);
      });

      categoryDiv.appendChild(examplesList);
      this.gestureList.appendChild(categoryDiv);
    }
  }

  startEditing(categoryDiv, currentName) {
    const header = categoryDiv.firstChild;
    const nameSpan = header.firstChild;
    const currentText = currentName;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'input';
    input.value = currentText;

    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        this.updateGestureName(currentName, input.value.trim());
      } else if (e.key === 'Escape') {
        this.updateGestureList();
      }
    };

    input.onblur = () => {
      this.updateGestureName(currentName, input.value.trim());
    };

    header.replaceChild(input, nameSpan);
    input.focus();
  }

  displayMatchResult(gestureName, similarity) {
    if (gestureName) {
      const examples = this.gestureLibrary.get(gestureName);
      this.matchResultElement.textContent =
        `Best match: ${gestureName} (${(similarity * 100).toFixed(1)}% confidence, trained with ${examples.length} examples)`;
    }
  }
}

// Initialize the gesture recognizer when the page loads
document.addEventListener('DOMContentLoaded', () => {
  new GestureRecognizer();
});