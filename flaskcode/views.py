import os
import mimetypes

from flask import render_template, abort, jsonify, send_file, g, request, session, redirect, url_for, flash

from .utils import write_file, dir_tree, get_file_extension
from . import blueprint


@blueprint.route('/')
def index():
    dirname = os.path.basename(g.flaskcode_resource_basepath)
    dtree = dir_tree(g.flaskcode_resource_basepath, g.flaskcode_resource_basepath + '/')
    return render_template('flaskcode/index.html', dirname=dirname, dtree=dtree)


@blueprint.route('/resource-data/<path:file_path>.txt', methods=['GET', 'HEAD'])
def resource_data(file_path):
    file_path = os.path.join(g.flaskcode_resource_basepath, file_path)
    if not (os.path.exists(file_path) and os.path.isfile(file_path)):
        abort(404)
    # Note: Flask 2.0+ uses 'max_age' instead of 'cache_timeout'
    # This package requires Flask>=3.1.0, so we use max_age
    response = send_file(file_path, mimetype='text/plain', max_age=0)
    mimetype, encoding = mimetypes.guess_type(file_path, False)
    if mimetype:
        response.headers.set('X-File-Mimetype', mimetype)
        extension = mimetypes.guess_extension(mimetype, False) or get_file_extension(file_path)
        if extension:
            response.headers.set('X-File-Extension', extension.lower().lstrip('.'))
    if encoding:
        response.headers.set('X-File-Encoding', encoding)
    return response


@blueprint.route('/update-resource-data/<path:file_path>', methods=['POST'])
def update_resource_data(file_path):
    file_path = os.path.join(g.flaskcode_resource_basepath, file_path)
    is_new_resource = bool(int(request.form.get('is_new_resource', 0)))
    if not is_new_resource and not (os.path.exists(file_path) and os.path.isfile(file_path)):
        abort(404)
    resource_data = request.form.get('resource_data', None)
    if resource_data:
        success, message = write_file(resource_data, file_path)
    else:
        success = False
        message = 'File data not uploaded'
    return jsonify({'success': success, 'message': message})


@blueprint.route('/rename-resource/<path:file_path>', methods=['POST'])
def rename_resource(file_path):
    file_path = os.path.join(g.flaskcode_resource_basepath, file_path)
    if not (os.path.exists(file_path) and os.path.isfile(file_path)):
        abort(404)
    
    new_name = request.form.get('new_name', '').strip()
    if not new_name:
        return jsonify({'success': False, 'message': 'New file name is required'})
    
    # Validate the new name
    if not new_name or '/' in new_name or '\\' in new_name:
        return jsonify({'success': False, 'message': 'Invalid file name'})
    
    # Get the directory of the original file
    file_dir = os.path.dirname(file_path)
    new_file_path = os.path.join(file_dir, new_name)
    
    # Check if the new file already exists
    if os.path.exists(new_file_path):
        return jsonify({'success': False, 'message': 'A file with this name already exists'})
    
    try:
        os.rename(file_path, new_file_path)
        # Return the new relative path
        new_relative_path = os.path.relpath(new_file_path, g.flaskcode_resource_basepath).replace('\\', '/')
        return jsonify({
            'success': True,
            'message': 'File renamed successfully',
            'new_path': new_relative_path,
            'new_url': url_for('flaskcode.resource_data', file_path=new_relative_path)
        })
    except OSError as err:
        return jsonify({'success': False, 'message': f'Could not rename file: {str(err)}'})


@blueprint.route('/settings', methods=['GET', 'POST'])
def settings():
    from flask import current_app
    from . import default_config
    
    available_themes = ['vs', 'vs-dark', 'hc-black', 'hc-light', 'github-dark', 'dracula', 'nord', 'github-light', 'solarized-light', 'night-owl-light']
    min_font_size = 10
    max_font_size = 40
    default_font_size = 13
    
    if request.method == 'POST':
        editor_theme = request.form.get('editor_theme', default_config.FLASKCODE_EDITOR_THEME)
        font_size = request.form.get('font_size', default_font_size)
        
        errors = []
        if editor_theme in available_themes:
            session['flaskcode_editor_theme'] = editor_theme
        else:
            errors.append('Invalid editor theme selected.')
        
        try:
            font_size = int(font_size)
            if min_font_size <= font_size <= max_font_size:
                session['flaskcode_font_size'] = font_size
            else:
                errors.append(f'Font size must be between {min_font_size} and {max_font_size}.')
        except (ValueError, TypeError):
            errors.append('Invalid font size value.')
        
        if errors:
            for error in errors:
                flash(error, 'error')
        else:
            flash('Settings saved successfully!', 'success')
            return redirect(url_for('flaskcode.index', theme_updated='1'))
    
    current_theme = session.get('flaskcode_editor_theme') or current_app.config.get(
        'FLASKCODE_EDITOR_THEME', default_config.FLASKCODE_EDITOR_THEME
    )
    current_font_size = session.get('flaskcode_font_size') or current_app.config.get(
        'FLASKCODE_EDITOR_FONT_SIZE', default_config.FLASKCODE_EDITOR_FONT_SIZE
    )
    
    return render_template(
        'flaskcode/settings.html',
        available_themes=available_themes,
        current_theme=current_theme,
        current_font_size=current_font_size,
        min_font_size=min_font_size,
        max_font_size=max_font_size,
    )
