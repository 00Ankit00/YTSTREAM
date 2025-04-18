from flask import Flask, render_template, request, jsonify, send_file
import yt_dlp
import os
import uuid
import re
from threading import Thread

app = Flask(__name__)
app.config['DOWNLOAD_FOLDER'] = 'downloads'
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500MB max

# Create downloads directory if it doesn't exist
os.makedirs(app.config['DOWNLOAD_FOLDER'], exist_ok=True)

# Dictionary to store download progress
download_progress = {}

def clean_filename(filename):
    """Clean filename to make it safe for file systems"""
    return re.sub(r'[^\w\-_\. ]', '_', filename)

def get_video_info(url):
    """Get video information using yt_dlp"""
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'format': 'bestvideo+bestaudio/best',
        'merge_output_format': 'mp4',
        'ffmpeg_location': r'C:\Users\rayro\Downloads\ffmpeg-7.1.1-essentials_build\ffmpeg-7.1.1-essentials_build\bin',
        'outtmpl': 'downloads/%(title)s.%(ext)s',
        'noplaylist': True,
        'postprocessors':[{
            'key':'FFmpegVideoConvertor',
            'preferedformat':'mp4',
        }],
        'verbose':True
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return {
                'title': info.get('title', 'Unknown Title'),
                'thumbnail': info.get('thumbnail', ''),
                'duration': info.get('duration', 0),
                'formats': get_available_formats(info)
            }
    except Exception as e:
        return {'error': str(e)}

def get_available_formats(_):
    """Extract available formats from video info"""
    formats = []
    # Add MP3 option
    formats.append({
        'id': 'mp3',
        'quality': 'MP3 Audio',
        'extension': 'mp3'
    })
    
    # Add video formats
    for res in ['480p', '720p', '1080p']:
        formats.append({
            'id': res.replace('p', ''),
            'quality': res,
            'extension': 'mp4'
        })
    
    return formats

def download_video(url, format_id, download_id):
    """Download video in specified format"""
    download_path = os.path.join(app.config['DOWNLOAD_FOLDER'], download_id)
    os.makedirs(download_path, exist_ok=True)
    
    # Set options based on format_id
    ydl_opts = {
        'progress_hooks': [lambda d: update_progress(d, download_id)],
        'outtmpl': os.path.join(download_path, '%(title)s.%(ext)s'),
    }
    
    try:
        if format_id == 'mp3':
            ydl_opts.update({
                'format': 'bestaudio/best',
                'postprocessors': [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '192',
                }],
            })
        else:
            # For video formats
            if format_id == '480':
                ydl_opts['format'] = 'bestvideo[height<=480]+bestaudio/best[height<=480]'
            elif format_id == '720':
                ydl_opts['format'] = 'bestvideo[height<=720]+bestaudio/best[height<=720]'
            elif format_id == '1080':
                ydl_opts['format'] = 'bestvideo[height<=1080]+bestaudio/best[height<=1080]'
            else:
                ydl_opts['format'] = 'bestvideo+bestaudio/best'
            
            ydl_opts['merge_output_format'] = 'mp4'
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)
            
            # Handle postprocessed filenames for mp3
            if format_id == 'mp3' and not filename.endswith('.mp3'):
                filename = os.path.splitext(filename)[0] + '.mp3'
            
            download_progress[download_id]['filename'] = os.path.basename(filename)
            download_progress[download_id]['status'] = 'completed'
            
            return filename
    except Exception as e:
        download_progress[download_id]['status'] = 'error'
        download_progress[download_id]['error'] = str(e)
        print(f"Download error: {e}")
        return None

def update_progress(d, download_id):
    """Update download progress"""
    if d['status'] == 'downloading':
        if '_percent_str' in d:
            percent = d['_percent_str'].strip()
            download_progress[download_id]['progress'] = percent
        elif 'downloaded_bytes' in d and 'total_bytes' in d and d['total_bytes'] > 0:
            percent = f"{(d['downloaded_bytes'] / d['total_bytes']) * 100:.1f}%"
            download_progress[download_id]['progress'] = percent
        else:
            download_progress[download_id]['progress'] = 'Unknown'
    elif d['status'] == 'finished':
        download_progress[download_id]['progress'] = '100%'

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/video-info', methods=['POST'])
def video_info():
    data = request.get_json()
    url = data.get('url', '')
    
    if not url:
        return jsonify({'error': 'No URL provided'}), 400
    
    info = get_video_info(url)
    if 'error' in info:
        return jsonify(info), 400
    
    return jsonify(info)

@app.route('/api/download', methods=['POST'])
def download():
    data = request.get_json()
    url = data.get('url', '')
    format_id = data.get('format', '')
    
    if not url or not format_id:
        return jsonify({'error': 'URL and format are required'}), 400
    
    download_id = str(uuid.uuid4())
    download_progress[download_id] = {
        'progress': '0%',
        'status': 'starting',
        'filename': None,
        'error': None
    }
    
    # Start download in a separate thread
    download_thread = Thread(target=download_video, args=(url, format_id, download_id))
    download_thread.start()
    
    return jsonify({
        'download_id': download_id,
        'message': 'Download started'
    })

@app.route('/api/progress/<download_id>')
def progress(download_id):
    if download_id not in download_progress:
        return jsonify({'error': 'Download not found'}), 404
    
    return jsonify(download_progress[download_id])

@app.route('/api/download-file/<download_id>')
def download_file(download_id):
    if download_id not in download_progress:
        return jsonify({'error': 'Download not found'}), 404
    
    progress_info = download_progress[download_id]
    
    if progress_info['status'] != 'completed':
        return jsonify({'error': 'Download not completed yet'}), 400
    
    filename = progress_info['filename']
    download_path = os.path.join(app.config['DOWNLOAD_FOLDER'], download_id, filename)
    
    if not os.path.exists(download_path):
        return jsonify({'error': 'File not found'}), 404
    
    return send_file(
        download_path,
        as_attachment=True,
        download_name=filename
    )

@app.route('/faq')
def faq():
    return render_template('faq.html')

@app.route('/about')
def about():
    return render_template('about.html')

# Cleanup old downloads periodically (this would be better with a proper task scheduler)
# For a production app, consider using Celery or a cron job

if __name__ == '__main__':
    app.run(debug=True)