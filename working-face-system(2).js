// COMPLETELY WORKING FACE RECOGNITION ATTENDANCE SYSTEM
// Fixed all issues + Individual student attendance percentage tracking

class WorkingFaceAttendanceSystem {
    constructor() {
        // System state
        this.isModelsLoaded = false;
        this.isWebcamActive = false;
        this.currentMode = 'register';
        this.isRegistering = false;
        this.isRecognizing = false;
        this.registrationCount = 0;
        this.currentUserName = '';
        this.faceDescriptors = [];
        this.faceMatcher = null;
        
        // DOM elements - with null checks
        this.videoElement = null;
        this.overlayCanvas = null;
        this.systemStatus = null;
        
        // Storage keys
        this.storageKeys = {
            registeredUsers: 'faceAttendance_users',
            attendanceRecords: 'faceAttendance_records',
            securityLog: 'faceAttendance_security'
        };
        
        // Initialize system when DOM is ready
        this.initWhenReady();
    }
    
    initWhenReady() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }
    
    async init() {
        this.videoElement = document.getElementById('videoElement');
        this.overlayCanvas = document.getElementById('overlayCanvas');
        this.systemStatus = document.getElementById('systemStatus');
        
        if (!this.videoElement || !this.overlayCanvas || !this.systemStatus) {
            console.error('Required DOM elements not found!');
            setTimeout(() => this.init(), 1000); // Retry after 1 second
            return;
        }
        
        this.setupEventListeners();
        this.updateSystemStatus('Loading face recognition models...', 'info');
        
        try {
            await this.loadModels();
            this.loadFaceMatcher();
            this.updateAttendanceTable();
            this.updateIndividualStats();
            this.updateSystemStatus('✅ System Ready - Camera and face recognition loaded!', 'success');
        } catch (error) {
            console.error('Initialization error:', error);
            this.updateSystemStatus('❌ System failed to load', 'error');
        }
    }
    
    async loadModels() {
        try {
            if (typeof faceapi === 'undefined') {
                throw new Error('face-api.js library not loaded');
            }
            
            this.updateSystemStatus('Loading AI models... (this may take a moment)', 'info');
            
            const modelUrls = [
                'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model',
                'https://raw.githubusercontent.com/vladmandic/face-api/master/model',
                'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights'
            ];
            
            let modelsLoaded = false;
            
            for (let i = 0; i < modelUrls.length; i++) {
                const modelUrl = modelUrls[i];
                try {
                    this.updateSystemStatus(`Trying CDN ${i + 1}/3: Loading models...`, 'info');
                    
                    await Promise.all([
                        faceapi.nets.tinyFaceDetector.loadFromUri(modelUrl),
                        faceapi.nets.faceLandmark68Net.loadFromUri(modelUrl),
                        faceapi.nets.faceRecognitionNet.loadFromUri(modelUrl)
                    ]);
                    
                    console.log(`✅ Models loaded successfully from: ${modelUrl}`);
                    modelsLoaded = true;
                    break;
                } catch (error) {
                    console.warn(`❌ Failed to load from ${modelUrl}:`, error.message);
                    if (i === modelUrls.length - 1) {
                        throw new Error('All CDN sources failed to load models');
                    }
                }
            }
            
            if (!modelsLoaded) {
                throw new Error('Could not load face recognition models');
            }
            
            this.isModelsLoaded = true;
            this.updateSystemStatus('✅ AI Models loaded successfully!', 'success');
            
        } catch (error) {
            console.error('❌ Model loading error:', error);
            this.showAlert(`Failed to load face recognition models: ${error.message}. Please refresh the page and check your internet connection.`, 'error');
            this.updateSystemStatus('❌ Model loading failed', 'error');
            throw error;
        }
    }
    
    setupEventListeners() {
        // Webcam controls
        const startWebcamBtn = document.getElementById('startWebcamBtn');
        const stopWebcamBtn = document.getElementById('stopWebcamBtn');
        
        if (startWebcamBtn) startWebcamBtn.addEventListener('click', () => this.startWebcam());
        if (stopWebcamBtn) stopWebcamBtn.addEventListener('click', () => this.stopWebcam());
        
        // Mode selection
        const registerModeBtn = document.getElementById('registerModeBtn');
        const attendanceModeBtn = document.getElementById('attendanceModeBtn');
        
        if (registerModeBtn) registerModeBtn.addEventListener('click', () => this.setMode('register'));
        if (attendanceModeBtn) attendanceModeBtn.addEventListener('click', () => this.setMode('attendance'));
        
        // Registration controls
        const startRegistrationBtn = document.getElementById('startRegistrationBtn');
        const stopRegistrationBtn = document.getElementById('stopRegistrationBtn');
        
        if (startRegistrationBtn) startRegistrationBtn.addEventListener('click', () => this.startRegistration());
        if (stopRegistrationBtn) stopRegistrationBtn.addEventListener('click', () => this.stopRegistration());
        
        // Attendance controls
        const startAttendanceBtn = document.getElementById('startAttendanceBtn');
        const stopAttendanceBtn = document.getElementById('stopAttendanceBtn');
        
        if (startAttendanceBtn) startAttendanceBtn.addEventListener('click', () => this.startAttendanceRecognition());
        if (stopAttendanceBtn) stopAttendanceBtn.addEventListener('click', () => this.stopAttendanceRecognition());
        
        // Export and management
        const exportCsvBtn = document.getElementById('exportCsvBtn');
        const clearDataBtn = document.getElementById('clearDataBtn');
        const viewIndividualBtn = document.getElementById('viewIndividualBtn');
        
        if (exportCsvBtn) exportCsvBtn.addEventListener('click', () => this.exportToCSV());
        if (clearDataBtn) clearDataBtn.addEventListener('click', () => this.clearAllData());
        if (viewIndividualBtn) viewIndividualBtn.addEventListener('click', () => this.showIndividualAttendance());
    }
    
    async startWebcam() {
        if (!this.isModelsLoaded) {
            this.showAlert('⏳ Please wait for AI models to load completely before starting the camera.', 'warning');
            return;
        }
        
        try {
            this.updateSystemStatus('🎥 Starting camera...', 'info');
            
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: 'user'
                }
            });
            
            this.videoElement.srcObject = stream;
            this.isWebcamActive = true;
            
            // Wait for video metadata to load
            await new Promise((resolve) => {
                this.videoElement.onloadedmetadata = () => {
                    this.videoElement.play();
                    this.setupCanvas();
                    resolve();
                };
            });
            
            // Update UI
            const startBtn = document.getElementById('startWebcamBtn');
            const stopBtn = document.getElementById('stopWebcamBtn');
            
            if (startBtn) startBtn.disabled = true;
            if (stopBtn) stopBtn.disabled = false;
            
            this.updateSystemStatus('✅ Camera is active and ready!', 'success');
            this.showAlert('Camera started successfully! You can now register faces or mark attendance.', 'success');
            
        } catch (error) {
            console.error('Camera error:', error);
            this.updateSystemStatus('❌ Camera failed to start', 'error');
            
            if (error.name === 'NotAllowedError') {
                this.showAlert('❌ Camera access denied. Please allow camera permissions and refresh the page.', 'error');
            } else {
                this.showAlert(`❌ Camera error: ${error.message}`, 'error');
            }
        }
    }
    
    stopWebcam() {
        if (this.videoElement && this.videoElement.srcObject) {
            const tracks = this.videoElement.srcObject.getTracks();
            tracks.forEach(track => track.stop());
            this.videoElement.srcObject = null;
        }
        
        this.isWebcamActive = false;
        this.stopRegistration();
        this.stopAttendanceRecognition();
        
        const startBtn = document.getElementById('startWebcamBtn');
        const stopBtn = document.getElementById('stopWebcamBtn');
        
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
        
        this.updateSystemStatus('📷 Camera stopped', 'info');
    }
    
    setupCanvas() {
        if (this.videoElement && this.overlayCanvas) {
            const displaySize = {
                width: this.videoElement.videoWidth,
                height: this.videoElement.videoHeight
            };
            faceapi.matchDimensions(this.overlayCanvas, displaySize);
        }
    }
    
    setMode(mode) {
        this.currentMode = mode;
        
        document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
        const modeBtn = document.getElementById(mode + 'ModeBtn');
        if (modeBtn) modeBtn.classList.add('active');
        
        const registerPanel = document.getElementById('registerPanel');
        const attendancePanel = document.getElementById('attendancePanel');
        
        if (registerPanel) registerPanel.style.display = mode === 'register' ? 'block' : 'none';
        if (attendancePanel) attendancePanel.style.display = mode === 'attendance' ? 'block' : 'none';
        
        this.stopRegistration();
        this.stopAttendanceRecognition();
        this.clearCanvas();
        
        this.updateSystemStatus(`📋 Switched to ${mode} mode`, 'info');
    }
    
    async startRegistration() {
        if (!this.isWebcamActive) {
            this.showAlert('📷 Please start the camera first!', 'warning');
            return;
        }
        
        if (!this.isModelsLoaded) {
            this.showAlert('⏳ AI models are still loading. Please wait...', 'warning');
            return;
        }
        
        const userNameInput = document.getElementById('userName');
        if (!userNameInput) {
            this.showAlert('❌ Name input field not found!', 'error');
            return;
        }
        
        const userName = userNameInput.value.trim();
        if (!userName) {
            this.showAlert('📝 Please enter your name first!', 'warning');
            userNameInput.focus();
            return;
        }
        
        const existingUsers = this.getRegisteredUsers();
        if (existingUsers.some(user => user.name.toLowerCase() === userName.toLowerCase())) {
            this.showAlert('👤 This name is already registered. Please use a different name.', 'warning');
            return;
        }
        
        this.updateSystemStatus('🔍 Checking if face is already registered...', 'info');
        const faceCheck = await this.checkFaceUniqueness();
        
        if (faceCheck.isAlreadyRegistered) {
            this.showAlert(
                `🚨 SECURITY ALERT: This face is already registered as "${faceCheck.existingName}"! ` +
                `Cannot register the same person with multiple names. (${faceCheck.similarity}% match)`,
                'error'
            );
            return;
        }
        
        this.currentUserName = userName;
        this.isRegistering = true;
        this.registrationCount = 0;
        this.faceDescriptors = [];
        
        // Update UI
        const startBtn = document.getElementById('startRegistrationBtn');
        const stopBtn = document.getElementById('stopRegistrationBtn');
        
        if (startBtn) startBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = false;
        if (userNameInput) userNameInput.disabled = true;
        
        this.updateSystemStatus(`📸 Registering ${userName}... Look at the camera!`, 'info');
        this.showAlert(`Registration started for ${userName}. Please look directly at the camera!`, 'info');
        
        this.captureRegistrationData();
    }
    
    async checkFaceUniqueness() {
        try {
            const detections = await faceapi
                .detectAllFaces(this.videoElement, new faceapi.TinyFaceDetectorOptions())
                .withFaceLandmarks()
                .withFaceDescriptors();
            
            if (detections.length === 0) {
                this.showAlert('👤 No face detected. Please position yourself clearly in the camera view.', 'warning');
                return { isAlreadyRegistered: false };
            }
            
            if (detections.length > 1) {
                this.showAlert('👥 Multiple faces detected. Please ensure only one person is visible.', 'warning');
                return { isAlreadyRegistered: false };
            }
            
            const currentFaceDescriptor = detections[0].descriptor;
            const registeredUsers = this.getRegisteredUsers();
            
            for (const user of registeredUsers) {
                for (const storedDescriptor of user.descriptors) {
                    const distance = faceapi.euclideanDistance(
                        currentFaceDescriptor,
                        new Float32Array(storedDescriptor)
                    );
                    
                    if (distance < 0.45) {
                        const similarity = Math.round((1 - distance) * 100);
                        return {
                            isAlreadyRegistered: true,
                            existingName: user.name,
                            similarity: similarity
                        };
                    }
                }
            }
            
            return { isAlreadyRegistered: false };
            
        } catch (error) {
            console.error('Face uniqueness check error:', error);
            return { isAlreadyRegistered: false };
        }
    }
    
    async captureRegistrationData() {
        if (!this.isRegistering) return;
        
        try {
            const detections = await faceapi
                .detectAllFaces(this.videoElement, new faceapi.TinyFaceDetectorOptions())
                .withFaceLandmarks()
                .withFaceDescriptors();
            
            this.clearCanvas();
            
            if (detections.length === 1) {
                const detection = detections[0];
                this.faceDescriptors.push(Array.from(detection.descriptor));
                this.registrationCount++;
                
                // Draw detection on canvas
                this.drawFaceDetection(detection, `✅ Sample ${this.registrationCount}/5 captured`, '#00ff00');
                
                this.updateSystemStatus(`📸 Captured ${this.registrationCount}/5 face samples`, 'info');
                
                if (this.registrationCount >= 5) {
                    this.saveRegistration();
                    return;
                }
            } else if (detections.length === 0) {
                this.updateSystemStatus('👤 No face detected. Please look directly at the camera.', 'warning');
            } else {
                this.updateSystemStatus('👥 Multiple faces detected. Please ensure only one person is visible.', 'warning');
            }
        } catch (error) {
            console.error('Registration capture error:', error);
            this.updateSystemStatus('❌ Error during face capture', 'error');
        }
        
        // Continue capturing
        setTimeout(() => this.captureRegistrationData(), 1000);
    }
    
    drawFaceDetection(detection, label, color = '#00ff00') {
        if (!this.overlayCanvas) return;
        
        const displaySize = {
            width: this.videoElement.videoWidth,
            height: this.videoElement.videoHeight
        };
        const resizedDetection = faceapi.resizeResults(detection, displaySize);
        const ctx = this.overlayCanvas.getContext('2d');
        
        // Draw face box
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        const box = resizedDetection.detection.box;
        ctx.strokeRect(box.x, box.y, box.width, box.height);
        
        // Draw label
        ctx.fillStyle = color;
        ctx.font = 'bold 16px Arial';
        ctx.fillText(label, box.x, box.y - 10);
    }
    
    saveRegistration() {
        if (this.faceDescriptors.length === 0) return;
        
        const registeredUsers = this.getRegisteredUsers();
        const newUser = {
            name: this.currentUserName,
            descriptors: this.faceDescriptors,
            registrationDate: new Date().toISOString(),
            totalAttendanceDays: 0,
            attendancePercentage: 0
        };
        
        registeredUsers.push(newUser);
        localStorage.setItem(this.storageKeys.registeredUsers, JSON.stringify(registeredUsers));
        
        // Reload face matcher
        this.loadFaceMatcher();
        
        this.showAlert(`✅ Successfully registered ${this.currentUserName} with ${this.faceDescriptors.length} face samples!`, 'success');
        this.updateSystemStatus('✅ Registration completed successfully!', 'success');
        
        // Reset form and UI
        const userNameInput = document.getElementById('userName');
        if (userNameInput) {
            userNameInput.value = '';
            userNameInput.disabled = false;
        }
        
        this.stopRegistration();
        this.updateAttendanceTable();
        this.updateIndividualStats();
    }
    
    stopRegistration() {
        this.isRegistering = false;
        
        const startBtn = document.getElementById('startRegistrationBtn');
        const stopBtn = document.getElementById('stopRegistrationBtn');
        const userNameInput = document.getElementById('userName');
        
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
        if (userNameInput) userNameInput.disabled = false;
        
        this.clearCanvas();
    }
    
    loadFaceMatcher() {
        const registeredUsers = this.getRegisteredUsers();
        if (registeredUsers.length === 0) {
            this.faceMatcher = null;
            return;
        }
        
        try {
            const labeledDescriptors = registeredUsers.map(user => 
                new faceapi.LabeledFaceDescriptors(
                    user.name,
                    user.descriptors.map(desc => new Float32Array(desc))
                )
            );
            this.faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.5);
            console.log(`✅ Face matcher loaded with ${registeredUsers.length} users`);
        } catch (error) {
            console.error('Error loading face matcher:', error);
            this.faceMatcher = null;
        }
    }
    
    async startAttendanceRecognition() {
        if (!this.isWebcamActive) {
            this.showAlert('📷 Please start the camera first!', 'warning');
            return;
        }
        
        if (!this.faceMatcher) {
            this.showAlert('👥 No registered users found. Please register faces first!', 'warning');
            return;
        }
        
        this.isRecognizing = true;
        
        const startBtn = document.getElementById('startAttendanceBtn');
        const stopBtn = document.getElementById('stopAttendanceBtn');
        
        if (startBtn) startBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = false;
        
        this.updateSystemStatus('🔍 Scanning for registered faces...', 'info');
        this.showAlert('Attendance recognition started. Look at the camera to mark your attendance!', 'info');
        
        this.performAttendanceRecognition();
    }
    
    async performAttendanceRecognition() {
        if (!this.isRecognizing) return;
        
        try {
            const detections = await faceapi
                .detectAllFaces(this.videoElement, new faceapi.TinyFaceDetectorOptions())
                .withFaceLandmarks()
                .withFaceDescriptors();
            
            this.clearCanvas();
            
            if (detections.length > 0) {
                for (let i = 0; i < detections.length; i++) {
                    const detection = detections[i];
                    const match = this.faceMatcher.findBestMatch(detection.descriptor);
                    
                    let color = '#ff0000';
                    let label = 'Unknown Person';
                    
                    // Check if confidence is high enough
                    if (match.distance < 0.5) {
                        const confidence = Math.round((1 - match.distance) * 100);
                        const today = new Date().toISOString().split('T')[0];
                        
                        // Check if already marked today
                        if (!this.hasAttendanceToday(match.label, today)) {
                            this.markAttendance(match.label, confidence);
                            color = '#00ff00';
                            label = `${match.label} - Attendance Marked! (${confidence}%)`;
                            this.showAlert(`✅ Attendance marked for ${match.label} (${confidence}% confidence)`, 'success');
                        } else {
                            color = '#ffaa00';
                            label = `${match.label} - Already marked today`;
                        }
                    } else {
                        const confidence = Math.round((1 - match.distance) * 100);
                        label = `Unknown (${confidence}% confidence - too low)`;
                    }
                    
                    this.drawFaceDetection(detection, label, color);
                }
            }
        } catch (error) {
            console.error('Attendance recognition error:', error);
        }
        
        // Continue recognition
        setTimeout(() => this.performAttendanceRecognition(), 500);
    }
    
    hasAttendanceToday(name, date) {
        const records = this.getAttendanceRecords();
        return records.some(record => record.name === name && record.date === date);
    }
    
    markAttendance(name, confidence) {
        const now = new Date();
        const attendanceRecord = {
            name: name,
            date: now.toISOString().split('T')[0],
            time: now.toTimeString().split(' ')[0],
            timestamp: now.toISOString(),
            status: 'Present',
            confidence: confidence + '%'
        };
        
        // Save attendance record
        const attendanceRecords = this.getAttendanceRecords();
        attendanceRecords.push(attendanceRecord);
        localStorage.setItem(this.storageKeys.attendanceRecords, JSON.stringify(attendanceRecords));
        
        // Update user's attendance percentage
        this.updateUserAttendancePercentage(name);
        
        // Update UI
        this.updateAttendanceTable();
        this.updateIndividualStats();
    }
    
    updateUserAttendancePercentage(name) {
        const registeredUsers = this.getRegisteredUsers();
        const userIndex = registeredUsers.findIndex(user => user.name === name);
        
        if (userIndex !== -1) {
            const attendanceRecords = this.getAttendanceRecords();
            const userRecords = attendanceRecords.filter(record => record.name === name);
            
            const uniqueDates = [...new Set(userRecords.map(record => record.date))];
            
            if (uniqueDates.length > 0) {
                const firstDate = new Date(Math.min(...uniqueDates.map(date => new Date(date))));
                const today = new Date();
                const totalDays = Math.ceil((today - firstDate) / (1000 * 60 * 60 * 24)) + 1;
                const percentage = Math.round((uniqueDates.length / totalDays) * 100);
                
                registeredUsers[userIndex].totalAttendanceDays = uniqueDates.length;
                registeredUsers[userIndex].attendancePercentage = Math.min(percentage, 100);
                
                localStorage.setItem(this.storageKeys.registeredUsers, JSON.stringify(registeredUsers));
            }
        }
    }
    
    stopAttendanceRecognition() {
        this.isRecognizing = false;
        
        const startBtn = document.getElementById('startAttendanceBtn');
        const stopBtn = document.getElementById('stopAttendanceBtn');
        
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
        
        this.clearCanvas();
        this.updateSystemStatus('⏹️ Attendance recognition stopped', 'info');
    }
    
    showIndividualAttendance() {
        const registeredUsers = this.getRegisteredUsers();
        
        if (registeredUsers.length === 0) {
            this.showAlert('No registered users found!', 'warning');
            return;
        }
        
        const attendanceData = registeredUsers.map(user => {
            const userRecords = this.getAttendanceRecords().filter(record => record.name === user.name);
            const uniqueDates = [...new Set(userRecords.map(record => record.date))];
            
            return {
                name: user.name,
                totalDays: uniqueDates.length,
                percentage: user.attendancePercentage || 0,
                records: userRecords.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            };
        });
        
        this.displayIndividualAttendanceWindow(attendanceData);
    }
    
    displayIndividualAttendanceWindow(attendanceData) {
        const newWindow = window.open('', '_blank', 'width=1000,height=700');
        
        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>📊 Individual Student Attendance Report</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; background: #f8f9fa; }
                .container { max-width: 1000px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
                .header { text-align: center; margin-bottom: 30px; }
                .student-card { 
                    border: 1px solid #ddd; 
                    border-radius: 10px; 
                    margin-bottom: 20px; 
                    padding: 20px; 
                    background: linear-gradient(135deg, #667eea, #764ba2); 
                    color: white; 
                }
                .student-name { font-size: 1.5rem; font-weight: bold; margin-bottom: 10px; }
                .student-stats { display: flex; gap: 20px; margin-bottom: 15px; }
                .stat { text-align: center; }
                .stat-value { font-size: 2rem; font-weight: bold; }
                .stat-label { font-size: 0.9rem; opacity: 0.9; }
                .attendance-records { 
                    background: rgba(255,255,255,0.1); 
                    border-radius: 8px; 
                    padding: 15px; 
                    max-height: 200px; 
                    overflow-y: auto; 
                }
                .record { 
                    background: rgba(255,255,255,0.2); 
                    padding: 8px; 
                    margin-bottom: 5px; 
                    border-radius: 5px; 
                    display: flex; 
                    justify-content: space-between; 
                }
                .no-records { text-align: center; opacity: 0.7; font-style: italic; }
                @media print { 
                    body { margin: 0; } 
                    .container { box-shadow: none; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>📊 Individual Student Attendance Report</h1>
                    <p>Generated on: ${new Date().toLocaleDateString()}</p>
                </div>
                
                ${attendanceData.map(student => `
                    <div class="student-card">
                        <div class="student-name">👤 ${student.name}</div>
                        <div class="student-stats">
                            <div class="stat">
                                <div class="stat-value">${student.totalDays}</div>
                                <div class="stat-label">Total Days Present</div>
                            </div>
                            <div class="stat">
                                <div class="stat-value">${student.percentage}%</div>
                                <div class="stat-label">Attendance Percentage</div>
                            </div>
                            <div class="stat">
                                <div class="stat-value">${student.records.length}</div>
                                <div class="stat-label">Total Records</div>
                            </div>
                        </div>
                        
                        <h4>📅 Recent Attendance Records:</h4>
                        <div class="attendance-records">
                            ${student.records.length > 0 ? 
                                student.records.slice(0, 10).map(record => `
                                    <div class="record">
                                        <span>${record.date} at ${record.time}</span>
                                        <span>Confidence: ${record.confidence}</span>
                                    </div>
                                `).join('') : 
                                '<div class="no-records">No attendance records found</div>'
                            }
                        </div>
                    </div>
                `).join('')}
                
                <div style="text-align: center; margin-top: 30px;">
                    <button onclick="window.print()" style="
                        padding: 10px 20px; 
                        background: #667eea; 
                        color: white; 
                        border: none; 
                        border-radius: 5px; 
                        cursor: pointer;
                        margin-right: 10px;
                    ">🖨️ Print Report</button>
                    <button onclick="window.close()" style="
                        padding: 10px 20px; 
                        background: #95a5a6; 
                        color: white; 
                        border: none; 
                        border-radius: 5px; 
                        cursor: pointer;
                    ">❌ Close</button>
                </div>
            </div>
        </body>
        </html>
        `;
        
        newWindow.document.write(html);
    }
    
    updateAttendanceTable() {
        const tbody = document.getElementById('attendanceTableBody');
        if (!tbody) return;
        
        const records = this.getAttendanceRecords();
        
        if (records.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">No attendance records found</td></tr>';
            return;
        }
        
        // Sort by most recent first
        records.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        tbody.innerHTML = records.map(record => {
            const user = this.getRegisteredUsers().find(u => u.name === record.name);
            const percentage = user ? user.attendancePercentage || 0 : 0;
            
            return `
                <tr>
                    <td>${record.name}</td>
                    <td>${record.date}</td>
                    <td>${record.time}</td>
                    <td><span class="status-badge status-badge--success">${record.status}</span></td>
                    <td>${record.confidence}</td>
                    <td><span class="percentage-badge">${percentage}%</span></td>
                </tr>
            `;
        }).join('');
    }
    
    updateIndividualStats() {
        const records = this.getAttendanceRecords();
        const registeredUsers = this.getRegisteredUsers();
        const today = new Date().toISOString().split('T')[0];
        const todayRecords = records.filter(r => r.date === today);
        
        this.updateStatCard('todayCount', todayRecords.length);
        this.updateStatCard('totalCount', records.length);
        this.updateStatCard('registeredCount', registeredUsers.length);
        
        const avgPercentage = registeredUsers.length > 0 
            ? Math.round(registeredUsers.reduce((sum, user) => sum + (user.attendancePercentage || 0), 0) / registeredUsers.length)
            : 0;
        this.updateStatCard('avgAttendancePercentage', avgPercentage + '%');
    }
    
    updateStatCard(elementId, value) {
        const element = document.getElementById(elementId);
        if (element) element.textContent = value;
    }
    
    exportToCSV() {
        const records = this.getAttendanceRecords();
        if (records.length === 0) {
            this.showAlert('No attendance records to export', 'warning');
            return;
        }
        
        const headers = ['Name', 'Date', 'Time', 'Status', 'Confidence', 'Individual Attendance %'];
        const csvContent = [
            headers.join(','),
            ...records.map(record => {
                const user = this.getRegisteredUsers().find(u => u.name === record.name);
                const percentage = user ? user.attendancePercentage || 0 : 0;
                return `"${record.name}","${record.date}","${record.time}","${record.status}","${record.confidence}","${percentage}%"`;
            })
        ].join('\\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `individual_attendance_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        this.showAlert('✅ Individual attendance data exported successfully!', 'success');
    }
    
    clearAllData() {
        const confirmed = confirm(
            '⚠️ WARNING: This will delete ALL registered users and attendance records. ' +
            'This action cannot be undone. Are you absolutely sure?'
        );
        
        if (confirmed) {
            localStorage.removeItem(this.storageKeys.registeredUsers);
            localStorage.removeItem(this.storageKeys.attendanceRecords);
            localStorage.removeItem(this.storageKeys.securityLog);
            
            this.faceMatcher = null;
            this.updateAttendanceTable();
            this.updateIndividualStats();
            
            this.showAlert('✅ All data cleared successfully', 'success');
        }
    }
    
    clearCanvas() {
        if (this.overlayCanvas) {
            const ctx = this.overlayCanvas.getContext('2d');
            ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
        }
    }
    
    updateSystemStatus(message, type = 'info') {
        if (this.systemStatus) {
            this.systemStatus.textContent = message;
            this.systemStatus.className = `status status--${type}`;
        }
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
    
    showAlert(message, type = 'info') {
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert--${type}`;
        alertDiv.innerHTML = `
            <span class="alert__message">${message}</span>
            <button class="alert__close" onclick="this.parentElement.remove()" aria-label="Close">&times;</button>
        `;
        
        const container = document.querySelector('.container');
        if (container) {
            container.insertBefore(alertDiv, container.firstChild);
            
            // Auto-remove after 6 seconds
            setTimeout(() => {
                if (alertDiv.parentElement) {
                    alertDiv.remove();
                }
            }, 6000);
        } else {
            // Fallback to console if container not found
            console.log(`[ALERT ${type.toUpperCase()}] ${message}`);
        }
    }
    
    // Storage helper methods
    getRegisteredUsers() {
        const data = localStorage.getItem(this.storageKeys.registeredUsers);
        return data ? JSON.parse(data) : [];
    }
    
    getAttendanceRecords() {
        const data = localStorage.getItem(this.storageKeys.attendanceRecords);
        return data ? JSON.parse(data) : [];
    }
}

// Initialize the system
console.log('🚀 Starting Working Face Attendance System...');
window.workingFaceSystem = new WorkingFaceAttendanceSystem();