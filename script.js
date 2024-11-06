document.addEventListener('DOMContentLoaded', function() {
    const cameraBtn = document.querySelector('.camera-btn');
    cameraBtn.onclick = startCamera;
});

let qrcode = null;
let countdownInterval = null;
let stream = null;

async function startCamera() {
    try {
        let camera = document.getElementById('camera');
        if (!camera) {
            camera = document.createElement('video');
            camera.id = 'camera';
            camera.autoplay = true;
            camera.playsInline = true;
            camera.style.width = '100%';
            camera.style.borderRadius = '6px';
            camera.style.marginBottom = '15px';
            document.querySelector('.camera-section').appendChild(camera);
        }

        const capturedImage = document.getElementById('captured-image');
        capturedImage.style.display = 'none';
        camera.style.display = 'block';

        stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: 'environment',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            } 
        });
        
        camera.srcObject = stream;

        const cameraBtn = document.querySelector('.camera-btn');
        cameraBtn.textContent = 'Capturar';
        cameraBtn.onclick = captureImage;

    } catch (err) {
        console.error('Error al acceder a la cámara:', err);
        alert('Error al acceder a la cámara. Por favor intenta de nuevo.');
    }
}

async function captureImage() {
    const camera = document.getElementById('camera');
    const canvas = document.getElementById('canvas');
    const capturedImage = document.getElementById('captured-image');

    canvas.width = camera.videoWidth;
    canvas.height = camera.videoHeight;
    const ctx = canvas.getContext('2d');
    
    ctx.drawImage(camera, 0, 0);

    capturedImage.src = canvas.toDataURL('image/jpeg', 1.0);
    capturedImage.style.display = 'block';
    camera.style.display = 'none';

    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }

    const cameraBtn = document.querySelector('.camera-btn');
    cameraBtn.textContent = 'Generar QR';
    cameraBtn.onclick = startCamera;

    processImage(canvas);
}

async function processImage(canvas) {
    try {
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
        const formData = new FormData();
        formData.append('image', blob);
        
        console.log("Subiendo imagen a ImgBB...");
        
        const uploadResponse = await fetch('https://api.imgbb.com/1/upload?key=52caeb3987a1d3e1407627928b18c14e', {
            method: 'POST',
            body: formData
        });
        
        const uploadResult = await uploadResponse.json();
        if (!uploadResult.success) {
            throw new Error('Error al subir la imagen');
        }

        const imageUrl = uploadResult.data.url;
        console.log("Imagen subida:", imageUrl);
        
        const ocrUrl = `https://api.ocr.space/parse/imageurl?apikey=helloworld&url=${encodeURIComponent(imageUrl)}&OCREngine=2`;
        
        console.log("Procesando OCR...");
        const ocrResponse = await fetch(ocrUrl);
        const ocrResult = await ocrResponse.json();
        
        if (!ocrResult.ParsedResults || ocrResult.ParsedResults.length === 0) {
            throw new Error('OCR no pudo extraer texto de la imagen');
        }

        const text = ocrResult.ParsedResults[0].ParsedText;
        console.log("Texto OCR detectado:", text);

        const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=AIzaSyCa362tZsWj38073XyGaMTmKC0YKc-W0I8`;
        
        const prompt = {
            "contents": [{
                "parts": [{
                    "text": `Del siguiente texto, extrae TODOS los códigos de barras numéricos (números de 12-14 dígitos). Devuelve solo los números separados por comas, sin ningún otro texto. Ejemplo de respuesta correcta: "123456789012,123456789013". Si no hay códigos válidos, devuelve una cadena vacía:\n\n${text}`
                }]
            }]
        };

        console.log("Enviando a Gemini...");
        const geminiResponse = await fetch(GEMINI_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(prompt)
        });

        const geminiResult = await geminiResponse.json();
        console.log("Respuesta de Gemini:", geminiResult);

        if (geminiResult.candidates && geminiResult.candidates[0]) {
            const detectedCodes = geminiResult.candidates[0].content.parts[0].text.trim().split(',');
            const validCodes = detectedCodes.filter(code => /^\d{12,14}$/.test(code.trim()));
            
            if (validCodes.length > 0) {
                // Limpiar contenedores anteriores
                document.getElementById('qrcode').innerHTML = '';
                
                // Generar QR para cada código válido
                validCodes.forEach((code, index) => {
                    // Crear contenedor principal para este código
                    const qrContainer = document.createElement('div');
                    qrContainer.className = 'qr-item';
                    qrContainer.style.marginBottom = '20px';
                    
                    // Crear div para el código QR
                    const qrDiv = document.createElement('div');
                    qrDiv.id = `qrcode-${index}`;
                    qrContainer.appendChild(qrDiv);
                    
                    // Crear div para el texto del código
                    const textDiv = document.createElement('div');
                    textDiv.className = 'qr-text';
                    textDiv.textContent = code;
                    qrContainer.appendChild(textDiv);

                    // Crear div para los resultados de la búsqueda
                    const resultsDiv = document.createElement('div');
                    resultsDiv.className = 'search-results';
                    resultsDiv.style.marginTop = '10px';
                    resultsDiv.textContent = 'Buscando producto...';
                    qrContainer.appendChild(resultsDiv);
                    
                    // Agregar al contenedor principal
                    document.getElementById('qrcode').appendChild(qrContainer);
                    
                    // Generar el código QR
                    new QRCode(qrDiv, {
                        text: code,
                        width: 128,
                        height: 128,
                        colorDark: "#000000",
                        colorLight: "#FFFFFF",
                        correctLevel: QRCode.CorrectLevel.H
                    });

                    // Buscar automáticamente el producto
                    window.open(`https://www.google.com/search?q=${encodeURIComponent(code)}`, '_blank');
                });
                
                startCountdown();
            } else {
                alert('No se encontraron códigos de barras válidos');
            }
        } else {
            alert('No se pudo procesar el texto');
        }

    } catch (error) {
        console.error('Error al procesar la imagen:', error);
        alert('Error al procesar la imagen. Por favor, intenta de nuevo.');
    }
}

function clearAll() {
    const capturedImage = document.getElementById('captured-image');
    capturedImage.style.display = 'none';
    capturedImage.src = '';

    const camera = document.getElementById('camera');
    if (camera) {
        camera.style.display = 'none';
    }

    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }

    document.getElementById('qrcode').innerHTML = '';
    document.getElementById('countdown').textContent = '';
    
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }

    const cameraBtn = document.querySelector('.camera-btn');
    cameraBtn.textContent = 'Generar QR';
    cameraBtn.onclick = startCamera;
}

function startCountdown() {
    let count = 30;
    const countdownElement = document.getElementById('countdown');
    countdownElement.textContent = `Limpieza automática en ${count} segundos`;

    if (countdownInterval) {
        clearInterval(countdownInterval);
    }

    countdownInterval = setInterval(() => {
        count--;
        countdownElement.textContent = `Limpieza automática en ${count} segundos`;
        
        if (count <= 0) {
            clearInterval(countdownInterval);
            clearAll();
        }
    }, 1000);
}