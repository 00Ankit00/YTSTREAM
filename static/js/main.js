document.addEventListener('DOMContentLoaded', () => {
    const videoUrlInput = document.getElementById('videoUrl');
    const fetchBtn = document.getElementById('fetchBtn');
    const videoInfoContainer = document.getElementById('videoInfoContainer');
    const videoThumbnail = document.getElementById('videoThumbnail');
    const videoTitle = document.getElementById('videoTitle');
    const videoDuration = document.getElementById('videoDuration');
    const formatOptions = document.getElementById('formatOptions');
    const downloadProgress = document.getElementById('downloadProgress');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const downloadStatus = document.getElementById('downloadStatus');
    const downloadFileBtn = document.getElementById('downloadFileBtn');
    
    let currentUrl = '';
    let selectedFormat = '';
    let downloadId = '';
    let progressInterval;
    
    // Format duration to minutes:seconds
    function formatDuration(seconds) {
        if (!seconds) return "Unknown duration";
        
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        
        if (minutes > 60) {
            const hours = Math.floor(minutes / 60);
            const remainingMinutes = minutes % 60;
            return `${hours}:${remainingMinutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
        }
        
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    
    // Fetch video info when button is clicked
    fetchBtn.addEventListener('click', async () => {
        const url = videoUrlInput.value.trim();
        
        if (!url) {
            alert('Please enter a YouTube URL');
            return;
        }
        
        // Show loading state
        fetchBtn.disabled = true;
        fetchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Fetching...';
        
        try {
            const response = await fetch('/api/video-info', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ url })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                // Update video info
                currentUrl = url;
                videoThumbnail.src = data.thumbnail;
                videoTitle.textContent = data.title;
                videoDuration.textContent = `Duration: ${formatDuration(data.duration)}`;
                
                // Generate format options
                formatOptions.innerHTML = '';
                
                data.formats.forEach(format => {
                    const formatOption = document.createElement('div');
                    formatOption.className = 'format-option';
                    formatOption.setAttribute('data-format', format.id);
                    
                    let icon = 'fa-video';
                    if (format.id === 'mp3') {
                        icon = 'fa-music';
                    }
                    
                    formatOption.innerHTML = `
                        <i class="fas ${icon}"></i>
                        <p>${format.quality}</p>
                    `;
                    
                    formatOption.addEventListener('click', () => {
                        // Remove selected class from all options
                        document.querySelectorAll('.format-option').forEach(option => {
                            option.classList.remove('selected');
                        });
                        
                        // Add selected class to clicked option
                        formatOption.classList.add('selected');
                        
                        // Store selected format
                        selectedFormat = format.id;
                        
                        // Start download
                        startDownload();
                    });
                    
                    formatOptions.appendChild(formatOption);
                });
                
                // Show video info
                videoInfoContainer.style.display = 'flex';
                
                // Add animation class
                videoInfoContainer.classList.add('fade-in');
                
                // Scroll to video info
                videoInfoContainer.scrollIntoView({ behavior: 'smooth' });
            } else {
                alert(`Error: ${data.error || 'Failed to fetch video info'}`);
            }
        } catch (error) {
            console.error('Error:', error);
            alert('An error occurred while fetching video info');
        } finally {
            // Reset button state
            fetchBtn.disabled = false;
            fetchBtn.innerHTML = '<i class="fas fa-search"></i> Fetch Video';
        }
    });
    
    // Allow Enter key to submit URL
    videoUrlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            fetchBtn.click();
        }
    });
    
    // Start download
    async function startDownload() {
        if (!currentUrl || !selectedFormat) {
            alert('Please select a format');
            return;
        }
        
        // Show download progress
        downloadProgress.style.display = 'block';
        progressBar.style.width = '0%';
        progressText.textContent = '0%';
        downloadStatus.textContent = 'Starting download...';
        downloadFileBtn.style.display = 'none';
        
        // Scroll to download progress
        downloadProgress.scrollIntoView({ behavior: 'smooth' });
        
        try {
            const response = await fetch('/api/download', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    url: currentUrl,
                    format: selectedFormat
                })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                downloadId = data.download_id;
                
                // Start checking progress
                checkProgress();
            } else {
                downloadStatus.textContent = `Error: ${data.error || 'Failed to start download'}`;
            }
        } catch (error) {
            console.error('Error:', error);
            downloadStatus.textContent = 'An error occurred while starting download';
        }
    }
    
    // Check download progress
    function checkProgress() {
        // Clear previous interval if exists
        if (progressInterval) {
            clearInterval(progressInterval);
        }
        
        progressInterval = setInterval(async () => {
            try {
                const response = await fetch(`/api/progress/${downloadId}`);
                const data = await response.json();
                
                if (response.ok) {
                    // Update progress
                    const percent = data.progress.replace('%', '');
                    progressBar.style.width = data.progress;
                    progressText.textContent = data.progress;
                    
                    // Update status based on download state
                    if (data.status === 'completed') {
                        downloadStatus.textContent = 'Download completed!';
                        downloadFileBtn.style.display = 'inline-block';
                        clearInterval(progressInterval);
                    } else if (data.status === 'error') {
                        downloadStatus.textContent = `Error: ${data.error || 'An error occurred during download'}`;
                        clearInterval(progressInterval);
                    } else {
                        downloadStatus.textContent = `Downloading... ${data.progress}`;
                    }
                } else {
                    downloadStatus.textContent = `Error: ${data.error || 'Failed to get progress'}`;
                    clearInterval(progressInterval);
                }
            } catch (error) {
                console.error('Error:', error);
                downloadStatus.textContent = 'An error occurred while checking progress';
                clearInterval(progressInterval);
            }
        }, 1000);
    }
    
    // Download file button
    downloadFileBtn.addEventListener('click', () => {
        if (!downloadId) {
            alert('No download available');
            return;
        }
        
        window.location.href = `/api/download-file/${downloadId}`;
    });
    
    // Add animation to steps and features
    const animateElements = () => {
        const elements = document.querySelectorAll('.step, .feature-card');
        
        elements.forEach((element, index) => {
            const observer = new IntersectionObserver(entries => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        setTimeout(() => {
                            element.style.opacity = '1';
                            element.style.transform = 'translateY(0)';
                        }, index * 100);
                        observer.unobserve(element);
                    }
                });
            }, { threshold: 0.1 });
            
            element.style.opacity = '0';
            element.style.transform = 'translateY(20px)';
            element.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
            
            observer.observe(element);
        });
    };
    
    // Run animations when page loads
    setTimeout(animateElements, 500);
});