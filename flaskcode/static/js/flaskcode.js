/* flaskcode scripts */
'use strict';

var flaskcode = window.flaskcode || {};

flaskcode.editorWidget = {
    editor: null,
    resourceName: null,
    editorState: null,
};
flaskcode.editorElement = null;

// Tab management system
flaskcode.tabs = {
    tabs: {},
    activeTabId: null,
    tabCounter: 0,
    
    getTabId: function(resourceUrl) {
        for (var tabId in this.tabs) {
            if (this.tabs[tabId].url === resourceUrl) {
                return tabId;
            }
        }
        return null;
    },
    
    createTab: function(resource) {
        var tabId = this.getTabId(resource.url);
        if (tabId) {
            this.switchToTab(tabId);
            return tabId;
        }
        
        tabId = 'tab-' + (++this.tabCounter);
        var fileName = resource.filePath.split('/').pop() || resource.filePath;
        
        this.tabs[tabId] = {
            id: tabId,
            url: resource.url,
            filePath: resource.filePath,
            fileName: fileName,
            model: null,
            state: flaskcode.editorStates.INIT,
            isNewResource: false,
            viewState: null
        };
        
        this.createTabElement(tabId, fileName);
        this.switchToTab(tabId);
        return tabId;
    },
    
    createTabElement: function(tabId, fileName) {
        var $tabList = $('#tab-list');
        var $tab = $('<li role="presentation" class="tab-item"></li>')
            .attr('data-tab-id', tabId)
            .append(
                $('<a href="javascript:void(0);"></a>')
                    .attr('title', this.tabs[tabId].filePath)
                    .append(
                        $('<span class="tab-text"></span>').text(fileName)
                    )
                    .append(
                        $('<span class="tab-close" title="Close">×</span>')
                            .on('click', function(e) {
                                e.stopPropagation();
                                flaskcode.tabs.closeTab(tabId);
                            })
                    )
            );
        
        $tabList.append($tab);
        $('#editor-tabs, #editor-toolbar, #new-file-btn').show();
    },
    
    switchToTab: function(tabId) {
        if (!this.tabs[tabId]) return false;
        
        var tab = this.tabs[tabId];
        
        // Save current tab state if switching away
        if (this.activeTabId && this.tabs[this.activeTabId]) {
            this.saveTabState(this.activeTabId);
        }
        
        // Update active tab
        this.activeTabId = tabId;
        $('#tab-list li').removeClass('active');
        $('#tab-list li[data-tab-id="' + tabId + '"]').addClass('active');
        
        // Update editor container data
        flaskcode.$editorContainer.data('url', tab.url);
        flaskcode.$editorContainer.data('filePath', tab.filePath);
        flaskcode.$editorContainer.data('isNewResource', tab.isNewResource);
        flaskcode.$editorContainer.data('tabId', tabId);
        
        // Switch editor model
        if (flaskcode.editorWidget.editor && tab.model) {
            flaskcode.editorWidget.editor.setModel(tab.model);
            flaskcode.editorWidget.resourceName = tab.url;
            if (tab.viewState) {
                flaskcode.editorWidget.editor.restoreViewState(tab.viewState);
            }
            flaskcode.setEditorState(tab.state);
            flaskcode.editorWidget.editor.focus();
            flaskcode.notifyCursorPosition(flaskcode.editorWidget.editor.getPosition());
        }
        
        // Update UI
        flaskcode.highlightSelectedResource(tab.filePath);
        this.updateTabModified(tabId);
        
        // Resource info is now in the tab itself
        
        return true;
    },
    
    saveTabState: function(tabId) {
        if (!this.tabs[tabId] || !flaskcode.editorWidget.editor) return;
        
        var tab = this.tabs[tabId];
        var model = flaskcode.editorWidget.editor.getModel();
        
        if (model && model.uri && model.uri.toString() === tab.url) {
            tab.viewState = flaskcode.editorWidget.editor.saveViewState();
            tab.state = flaskcode.editorWidget.editorState;
        }
    },
    
    updateTabModified: function(tabId) {
        if (!this.tabs[tabId]) return;
        
        var tab = this.tabs[tabId];
        var $tab = $('#tab-list li[data-tab-id="' + tabId + '"]');
        var $tabLink = $tab.find('a');
        
        if (tab.state === flaskcode.editorStates.MODIFIED) {
            $tabLink.addClass('tab-modified');
        } else {
            $tabLink.removeClass('tab-modified');
        }
    },
    
    closeTab: function(tabId) {
        if (!this.tabs[tabId]) return false;
        
        var tab = this.tabs[tabId];
        
        // Check for unsaved changes
        if (tab.state === flaskcode.editorStates.MODIFIED) {
            if (!confirm('File has unsaved changes. Are you sure you want to close it?')) {
                return false;
            }
        }
        
        // Remove tab element
        $('#tab-list li[data-tab-id="' + tabId + '"]').remove();
        
        // Dispose model if it exists
        if (tab.model) {
            tab.model.dispose();
        }
        
        // Remove from tabs object
        delete this.tabs[tabId];
        
        // If this was the active tab, switch to another
        if (this.activeTabId === tabId) {
            var remainingTabs = Object.keys(this.tabs);
            if (remainingTabs.length > 0) {
                this.switchToTab(remainingTabs[remainingTabs.length - 1]);
            } else {
                this.activeTabId = null;
                flaskcode.clearEditor();
                $('#editor-tabs, #editor-toolbar, #new-file-btn').hide();
            }
        }
        
        return true;
    },
    
    getActiveTab: function() {
        if (!this.activeTabId || !this.tabs[this.activeTabId]) {
            return null;
        }
        return this.tabs[this.activeTabId];
    }
};

flaskcode.languages = [];
flaskcode.defaultExt = 'txt';
flaskcode.defaultLangId = 'plaintext';
flaskcode.defaultLang = null;

flaskcode.$editorContainer = null;
flaskcode.$editorBody = null;
flaskcode.$editorLoader = null;
flaskcode.$pagePreloader = null;

flaskcode.editorStates = {
    INIT: 'init',
    LOADED: 'loaded',
    MODIFIED: 'modified',
    BUSY: 'busy',
};

flaskcode.defaultEditorTheme = 'vs-dark';
flaskcode.availableEditorThemes = ['vs', 'vs-dark', 'hc-black', 'hc-light', 'github-dark', 'dracula', 'nord', 'github-light', 'solarized-light', 'night-owl-light'];

flaskcode.APP_BUSY = false;

flaskcode.allowedLangIds = [];

flaskcode.onStateChange = $.noop;

require.config({
    baseUrl: flaskcode.config.get('pluginsBaseUrl'),
    paths: {'vs': 'monaco-editor/min/vs'}
});

$(function () {
    flaskcode.$pagePreloader = $('div#page-preloader');
    flaskcode.$editorContainer = $('div#editor-container');
    flaskcode.$editorBody = flaskcode.$editorContainer.find('.editor-body');
    flaskcode.$editorLoader = flaskcode.$editorContainer.find('.editor-preloader');
    flaskcode.editorElement = flaskcode.$editorBody.get(0);

    $('ul#dir-tree').treed();
    flaskcode.setEditorState(flaskcode.editorStates.INIT);

    // New file button handler - attach outside require block so it's always available
    // Handle clicks on both the button and the icon inside
    $(document).on('click', '#new-file-btn, #new-file-btn i', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        console.log('New file button clicked');
        
        // Check if openNewFileModal is available
        if (typeof flaskcode.openNewFileModal !== 'function') {
            console.error('openNewFileModal function not available yet');
            alert('Editor is still loading. Please wait a moment and try again.');
            return false;
        }
        
        var $targetDir = null;
        
        // Try to use the active tab's directory
        if (flaskcode.tabs && typeof flaskcode.tabs.getActiveTab === 'function') {
            var activeTab = flaskcode.tabs.getActiveTab();
            if (activeTab && activeTab.filePath) {
                // Get the directory path from the active file
                var filePath = activeTab.filePath;
                var dirPath = filePath.substring(0, filePath.lastIndexOf('/')) || '';
                
                // Find the directory item in the tree that matches
                if (dirPath) {
                    $targetDir = $('ul#dir-tree .dir-item[data-path-name="' + dirPath + '"]').first();
                }
                
                // If not found, try to find parent directories
                if ((!$targetDir || !$targetDir.length) && dirPath) {
                    var pathParts = dirPath.split('/');
                    for (var i = pathParts.length; i > 0; i--) {
                        var testPath = pathParts.slice(0, i).join('/');
                        $targetDir = $('ul#dir-tree .dir-item[data-path-name="' + testPath + '"]').first();
                        if ($targetDir && $targetDir.length) break;
                    }
                }
            }
        }
        
        // Fallback to root directory
        if (!$targetDir || !$targetDir.length) {
            $targetDir = $('ul#dir-tree > li.dir-item').first();
            if (!$targetDir || !$targetDir.length) {
                $targetDir = $('ul#dir-tree .dir-item').first();
            }
        }
        
        console.log('Target directory:', ($targetDir && $targetDir.length) ? $targetDir.data('pathName') : 'none found');
        
        if ($targetDir && $targetDir.length) {
            // Use the found directory to create new file
            console.log('Opening new file modal');
            flaskcode.openNewFileModal($targetDir);
        } else {
            // If no directory found, show error
            console.error('No directory found');
            alert('Unable to find directory. Please select a directory from the file tree first.');
        }
        
        return false;
    });

    require(['vs/editor/editor.main'], function() {
        try {
            // Define custom themes
            flaskcode.defineCustomThemes();
            
            flaskcode.languages = monaco.languages.getLanguages();
            flaskcode.allowedLangIds = flaskcode.languages.map(function (lang) { return lang.id; });
            flaskcode.defaultLang = flaskcode.getLanguageById(flaskcode.defaultLangId);

            $('ul#dir-tree').on('click', '.file-item', function () {
                return flaskcode.openResource($(this));
            });
            
            // Tab click handler
            $(document).on('click', '#tab-list li.tab-item > a', function(e) {
                if (!$(e.target).hasClass('tab-close')) {
                    var tabId = $(this).closest('li').data('tab-id');
                    flaskcode.tabs.switchToTab(tabId);
                }
            });

            $('.header-actions').on('click', function () {
                if (flaskcode.editorWidget.editor) {
                    flaskcode.editorWidget.editor.trigger('mouse', $(this).data('actionId'));
                }
            });

            $('#toggle-minimap').on('click', function () {
                flaskcode.minimapEnabled(!flaskcode.minimapEnabled());
            });

            $.contextMenu({
            selector: 'ul#dir-tree .resource-items',
            autoHide: false,
            build: function ($trigger, e) {
                var items = {
                    'title': {name: $trigger.data('pathName'), icon: 'fa-tag', disabled: true},
                    'sep': '---------'
                };
                if ($trigger.hasClass('dir-item')) {
                    items['title']['icon'] = 'fa-folder';
                    if ($trigger.hasClass('expanded')) {
                        items['toggle_collapse'] = {name: 'Collapse', icon: 'fa-compress'};
                    } else {
                        items['toggle_collapse'] = {name: 'Expand', icon: 'fa-expand'};
                    }
                    items['create_new_file'] = {name: 'Create New File', icon: 'fa-file-code-o'};
                } else {
                    items['title']['icon'] = 'fa-file';
                    items['open'] = {name: 'Open', icon: 'fa-external-link', disabled: $trigger.hasClass('selected')};
                    items['rename'] = {name: 'Rename', icon: 'fa-edit'};
                }
                return {
                    items: items,
                    callback: function (key, options) {
                        switch (key) {
                            case 'toggle_collapse':
                                options.$trigger.click();
                                break;
    
                            case 'open':
                                flaskcode.openResource(options.$trigger);
                                break;
    
                            case 'rename':
                                if (typeof flaskcode.openRenameModal === 'function') {
                                    flaskcode.openRenameModal(options.$trigger);
                                } else {
                                    console.error('openRenameModal function not found');
                                    alert('Rename functionality is not available. Please refresh the page.');
                                }
                                break;
    
                            case 'create_new_file':
                                flaskcode.openNewFileModal(options.$trigger);
                                break;
                        }
                    },
                };
            },
            events: {
                show: function (options) {},
                hide: function (options) {},
                },
            });
        
            $('#fileNameModal').on('shown.bs.modal', function () {
                $(this).find('#new_filename').focus();
            });
            
            $('#renameFileModal').on('shown.bs.modal', function () {
                $(this).find('#rename_filename').focus().select();
            });

            $('form#fileNameForm').on('submit', function (evt) {
            evt.preventDefault();
            var $form = $(this);
            var $button = $form.find('[type="submit"]');
            var base_url = $form.find('#base_url').val();
            var base_path_name = $form.find('#base_path_name').val();
            var new_filename = $form.find('#new_filename').val();
            if (!(new_filename && flaskcode.validResource(new_filename))) {
                $form.find('.form-msg').empty().append(
                    $('<span class="text-danger">Please enter valid file name.</span>').autoremove(10)
                );
            } else {
                var resource_url = base_url + '/' + new_filename + '.txt';
                $.ajax({
                    type: 'HEAD',
                    url: resource_url,
                    dataType: 'text',
                    cache: false,
                    beforeSend: function (xhr, settings) {
                        $button.button('loading');
                    },
                    complete: function (xhr, status) {
                        $button.button('reset');
                    },
                }).done(function (data, status, xhr) {
                    $form.find('.form-msg').empty().append(
                        $('<span class="text-danger">This file already exists.</span>').autoremove(10)
                    );
                }).fail(function (xhr, status, err) {
                    if (xhr.status == 404) {
                        flaskcode.loadEditor({
                            url: resource_url,
                            filePath: base_path_name + '/' + new_filename
                        }, false, true);
                        $('#fileNameModal').modal('hide');
                    } else {
                        $form.find('.form-msg').empty().append(
                            $('<span class="text-danger">Internal Error: '+err+'</span>').autoremove(10)
                        );
                    }
                });
            }
                return false;
            });
            
            $('form#renameFileForm').on('submit', function (evt) {
                evt.preventDefault();
                var $form = $(this);
                var $button = $form.find('[type="submit"]');
                var oldPath = $form.find('#rename_old_path').val();
                var newName = $form.find('#rename_filename').val().trim();
                
                if (!newName) {
                    $form.find('.form-msg').empty().append(
                        $('<span class="text-danger">Please enter a file name.</span>').autoremove(10)
                    );
                    return false;
                }
                
                if (!flaskcode.validResource(newName)) {
                    $form.find('.form-msg').empty().append(
                        $('<span class="text-danger">Please enter a valid file name.</span>').autoremove(10)
                    );
                    return false;
                }
                
                // Construct rename URL - replace update-resource-data with rename-resource
                var baseUrl = flaskcode.config.get('updateResourceBaseUrl') || '';
                // baseUrl is like "/update-resource-data/" or "/update-resource-data"
                var renameUrl = baseUrl.replace('update-resource-data', 'rename-resource');
                // Ensure we have a trailing slash before appending the path
                if (renameUrl && !renameUrl.endsWith('/')) {
                    renameUrl += '/';
                }
                renameUrl += oldPath;
                
                $.ajax({
                    type: 'POST',
                    url: renameUrl,
                    data: {
                        new_name: newName
                    },
                    beforeSend: function (xhr, settings) {
                        $button.button('loading');
                    },
                    complete: function (xhr, status) {
                        $button.button('reset');
                    },
                }).done(function (data, status, xhr) {
                    if (data.success) {
                        // Update tabs if file is open
                        if (flaskcode.tabs) {
                            var tabId = flaskcode.tabs.getTabId(flaskcode.config.get('resourceUrlTemplate').replace('__pathname__', oldPath));
                            if (tabId) {
                                var tab = flaskcode.tabs.tabs[tabId];
                                if (tab) {
                                    // Update tab data
                                    tab.filePath = data.new_path;
                                    tab.fileName = newName;
                                    tab.url = data.new_url;
                                    
                                    // Update tab element
                                    var $tabLink = $('#tab-list li[data-tab-id="' + tabId + '"] a');
                                    $tabLink.find('.tab-text').text(newName);
                                    $tabLink.attr('title', data.new_path);
                                }
                            }
                        }
                        
                        // Reload the page to update the file tree
                        window.location.reload();
                    } else {
                        $form.find('.form-msg').empty().append(
                            $('<span class="text-danger">' + (data.message || 'Error renaming file.') + '</span>').autoremove(10)
                        );
                    }
                }).fail(function (xhr, status, err) {
                    var errorMsg = 'Error renaming file.';
                    if (xhr.responseJSON && xhr.responseJSON.message) {
                        errorMsg = xhr.responseJSON.message;
                    }
                    $form.find('.form-msg').empty().append(
                        $('<span class="text-danger">' + errorMsg + '</span>').autoremove(10)
                    );
                });
                return false;
            });

            $('#editor-header #resource-close').on('click', function () {
                if (
                    flaskcode.editorWidget.editorState == flaskcode.editorStates.MODIFIED &&
                    !confirm('Close without saving?')
                ) {
                    return false;
                }
                flaskcode.saveResourceState();
                flaskcode.clearEditor();
                flaskcode.resetSelectedResource();
                $('#editor-header #resource-mod').hide();
                $('#editor-header #resource-name').text('').attr('title', '');
                $(this).hide();
            });

            $(window).on('resize', function () {
                if (flaskcode.editorWidget.editor) {
                    flaskcode.editorWidget.editor.layout();
                }
            });

            $(window).on('beforeunload', function (evt) {
                if (flaskcode.APP_BUSY || flaskcode.editorWidget.editorState == flaskcode.editorStates.BUSY) {
                    evt.preventDefault();
                    evt.returnValue = 'Editor is working...';
                    return evt.returnValue;
                }
            });
        } catch (e) {
            console.error('Error initializing Monaco editor:', e);
        }
        
        flaskcode.$pagePreloader.fadeOut();
        
        // Check for settings updates and apply them
        flaskcode.checkAndUpdateSettings();
    });
});

flaskcode.editorTheme = function () {
    var theme = flaskcode.config.get('editorTheme', flaskcode.defaultEditorTheme);
    // Allow custom themes even if not in the original list
    if (flaskcode.availableEditorThemes.indexOf(theme) > -1 || 
        ['github-dark', 'dracula', 'nord', 'github-light', 'solarized-light', 'night-owl-light'].indexOf(theme) > -1) {
        return theme;
    }
    return flaskcode.defaultEditorTheme;
};

flaskcode.editorFontSize = function () {
    var fontSize = flaskcode.config.get('fontSize', 13);
    var size = parseInt(fontSize, 10);
    return (isNaN(size) || size < 10 || size > 40) ? 13 : size;
};

flaskcode.defineCustomThemes = function () {
    if (typeof monaco === 'undefined' || typeof monaco.editor === 'undefined') {
        return;
    }
    
    try {
        // GitHub Dark theme
        monaco.editor.defineTheme('github-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
            { token: 'comment', foreground: '6a737d', fontStyle: 'italic' },
            { token: 'keyword', foreground: 'f97583' },
            { token: 'string', foreground: '9ecbff' },
            { token: 'number', foreground: '79b8ff' },
            { token: 'type', foreground: '79b8ff' },
            { token: 'class', foreground: 'b392f0' },
            { token: 'function', foreground: 'b392f0' },
        ],
        colors: {
            'editor.background': '#0d1117',
            'editor.foreground': '#c9d1d9',
            'editorLineNumber.foreground': '#6e7681',
            'editor.selectionBackground': '#264f78',
        }
    });
    
    // Dracula theme
    monaco.editor.defineTheme('dracula', {
        base: 'vs-dark',
        inherit: true,
        rules: [
            { token: 'comment', foreground: '6272a4', fontStyle: 'italic' },
            { token: 'keyword', foreground: 'ff79c6' },
            { token: 'string', foreground: 'f1fa8c' },
            { token: 'number', foreground: 'bd93f9' },
            { token: 'type', foreground: '8be9fd' },
            { token: 'class', foreground: '50fa7b' },
            { token: 'function', foreground: '50fa7b' },
        ],
        colors: {
            'editor.background': '#282a36',
            'editor.foreground': '#f8f8f2',
            'editorLineNumber.foreground': '#6272a4',
            'editor.selectionBackground': '#44475a',
        }
    });
    
    // Nord theme
    monaco.editor.defineTheme('nord', {
        base: 'vs-dark',
        inherit: true,
        rules: [
            { token: 'comment', foreground: '616e88', fontStyle: 'italic' },
            { token: 'keyword', foreground: '81a1c1' },
            { token: 'string', foreground: 'a3be8c' },
            { token: 'number', foreground: 'b48ead' },
            { token: 'type', foreground: '8fbcbb' },
            { token: 'class', foreground: '88c0d0' },
            { token: 'function', foreground: '88c0d0' },
        ],
        colors: {
            'editor.background': '#2e3440',
            'editor.foreground': '#d8dee9',
            'editorLineNumber.foreground': '#4c566a',
            'editor.selectionBackground': '#434c5e',
        }
    });
    
    // GitHub Light theme
    monaco.editor.defineTheme('github-light', {
        base: 'vs',
        inherit: true,
        rules: [
            { token: 'comment', foreground: '6a737d', fontStyle: 'italic' },
            { token: 'keyword', foreground: 'd73a49' },
            { token: 'string', foreground: '032f62' },
            { token: 'number', foreground: '005cc5' },
            { token: 'type', foreground: '005cc5' },
            { token: 'class', foreground: '6f42c1' },
            { token: 'function', foreground: '6f42c1' },
        ],
        colors: {
            'editor.background': '#ffffff',
            'editor.foreground': '#24292e',
            'editorLineNumber.foreground': '#959da5',
            'editor.selectionBackground': '#c8e1ff',
        }
    });
    
    // Solarized Light theme
    monaco.editor.defineTheme('solarized-light', {
        base: 'vs',
        inherit: true,
        rules: [
            { token: 'comment', foreground: '93a1a1', fontStyle: 'italic' },
            { token: 'keyword', foreground: '859900' },
            { token: 'string', foreground: '2aa198' },
            { token: 'number', foreground: 'd33682' },
            { token: 'type', foreground: 'b58900' },
            { token: 'class', foreground: 'b58900' },
            { token: 'function', foreground: '268bd2' },
        ],
        colors: {
            'editor.background': '#fdf6e3',
            'editor.foreground': '#657b83',
            'editorLineNumber.foreground': '#93a1a1',
            'editor.selectionBackground': '#eee8d5',
        }
    });
    
    // Night Owl Light theme
    monaco.editor.defineTheme('night-owl-light', {
        base: 'vs',
        inherit: true,
        rules: [
            { token: 'comment', foreground: '5c6370', fontStyle: 'italic' },
            { token: 'keyword', foreground: 'c678dd' },
            { token: 'string', foreground: '50a14f' },
            { token: 'number', foreground: '986801' },
            { token: 'type', foreground: 'e06c75' },
            { token: 'class', foreground: 'e06c75' },
            { token: 'function', foreground: '61afef' },
            { token: 'variable', foreground: '383a42' },
        ],
        colors: {
            'editor.background': '#fafafa',
            'editor.foreground': '#383a42',
            'editorLineNumber.foreground': '#a0a1a7',
            'editor.selectionBackground': '#d6d6d6',
            'editor.lineHighlightBackground': '#e5e5e6',
        }
    });
    } catch (e) {
        console.error('Error defining custom themes:', e);
    }
};

flaskcode.updateEditorSettings = function () {
    if (typeof monaco !== 'undefined' && flaskcode.editorWidget && flaskcode.editorWidget.editor) {
        var newTheme = flaskcode.editorTheme();
        var newFontSize = flaskcode.editorFontSize();
        
        // Update theme
        monaco.editor.setTheme(newTheme);
        
        // Update font size
        flaskcode.editorWidget.editor.updateOptions({
            fontSize: newFontSize
        });
        
        // Update container class for light themes
        var $container = flaskcode.$editorContainer;
        if ($container && $container.length) {
            if (newTheme === 'vs' || newTheme === 'hc-light' || newTheme === 'github-light' || newTheme === 'solarized-light' || newTheme === 'night-owl-light') {
                $container.addClass('light-theme');
            } else {
                $container.removeClass('light-theme');
            }
        }
    }
};

flaskcode.checkAndUpdateSettings = function () {
    var urlParams = new URLSearchParams(window.location.search);
    var themeUpdated = urlParams.get('theme_updated') === '1';
    
    if (themeUpdated) {
        // Try to update immediately if editor is ready
        flaskcode.updateEditorSettings();
        // Also try after a short delay in case Monaco is still loading
        setTimeout(flaskcode.updateEditorSettings, 100);
        // Clean up URL parameter
        var newUrl = window.location.pathname;
        if (window.location.search) {
            var params = new URLSearchParams(window.location.search);
            params.delete('theme_updated');
            if (params.toString()) {
                newUrl += '?' + params.toString();
            }
        }
        window.history.replaceState({}, '', newUrl);
    }
};

flaskcode.setEditorState = function (state) {
    var prevState = flaskcode.editorWidget.editorState;
    flaskcode.editorWidget.editorState = state;
    if (flaskcode.editorWidget.editorState != prevState) {
        flaskcode.onStateChange(flaskcode.editorWidget.editorState);
    }
};

flaskcode.getExt = function (filename) {
    var m = filename.match(/\.(\w*)$/i);
    return (m && m.length > 1) ? m[1].toLowerCase() : null;
};

flaskcode.getResourceExt = function (resource_url) {
    var m = resource_url.match(/\.(\w*)\.txt$/i);
    return (m && m.length > 1) ? m[1].toLowerCase() : null;
};

flaskcode.getLanguageById = function (langId) {
    return flaskcode.languages.find(function (lang) {
        return lang.id == langId;
    });
};

flaskcode.getLanguageByExtension = function (extension) {
    return flaskcode.languages.find(function (lang) {
        var extensions = lang.extensions || [];
        return extensions.indexOf('.'+extension) > -1;
    });
};

flaskcode.getLanguageByMimetype = function (mimetype) {
    return flaskcode.languages.find(function (lang) {
        var mimetypes = lang.mimetypes || [];
        return mimetypes.indexOf(mimetype) > -1;
    });
};

flaskcode.minimapEnabled = function (minimapFlag) {
    if (typeof minimapFlag === 'undefined') {
        var flag = flaskcode.storage.get('flaskcodeMinimapEnabled');
        return flag === null ? true : !!parseInt(flag);
    } else {
        if (flaskcode.editorWidget.editor) {
            flaskcode.editorWidget.editor.updateOptions({
                minimap: {enabled: !!minimapFlag},
            });
            flaskcode.storage.set('flaskcodeMinimapEnabled', Number(!!minimapFlag));
        }
    }
};

flaskcode.notifyEditor = function (message, category) {
    var msgType = category == 'error' ? 'danger' : 'success';
    var $msg = $('<div class="alert alert-dismissible alert-'+msgType+'" role="alert">'+
        '<button type="button" class="close" data-dismiss="alert" aria-label="Close">'+
        '<i class="fa fa-times" aria-hidden="true"></i>'+
        '</button>'+
        '<strong>'+message+'</strong>'+
    '</div>');
    $msg.autoremove(msgType == 'success' ? 3 : 7);
    flaskcode.$editorContainer.find('.editor-notification').empty().append($msg);
};

flaskcode.showSaveNotification = function () {
    var activeTab = flaskcode.tabs.getActiveTab();
    if (!activeTab) return;
    
    var $activeTab = $('#tab-list li[data-tab-id="' + activeTab.id + '"]');
    var $tabLink = $activeTab.find('a');
    
    // Remove any existing save notification
    $tabLink.find('.save-notification-pill').remove();
    
    // Create the save notification pill
    var $pill = $('<span class="save-notification-pill badge badge-success" style="animation: fadeIn 0.3s ease-in;">' +
        '<i class="fa fa-check" aria-hidden="true"></i> Saved' +
    '</span>');
    
    // Insert after the tab text (before the close button)
    var $tabText = $tabLink.find('.tab-text');
    var $closeBtn = $tabLink.find('.tab-close');
    
    if ($tabText.length && $closeBtn.length) {
        // Insert between tab text and close button
        $closeBtn.before($pill);
    } else if ($closeBtn.length) {
        // If no tab-text span, insert before close button
        $closeBtn.before($pill);
    } else {
        // If no close button, append to end
        $tabLink.append($pill);
    }
    
    // Remove after 3 seconds with fade out
    setTimeout(function() {
        $pill.fadeOut(300, function() {
            $(this).remove();
        });
    }, 3000);
};

flaskcode.editorBodyMsg = function (content) {
    return $('<div class="editor-body-msg">'+content+'</div>');
};

flaskcode.resetSelectedResource = function () {
    $('ul#dir-tree .file-item').removeClass('selected');
};

flaskcode.highlightSelectedResource = function (filePath, parentPath) {
    flaskcode.resetSelectedResource();
    var $selectedElement = $('ul#dir-tree .file-item[data-path-name="'+filePath+'"]');
    if ($selectedElement.length) {
        $selectedElement.addClass('selected');
    } else if (parentPath) {
        var $parentItem = $('.dir-item[data-path-name="'+parentPath+'"]');
        if ($parentItem.length) {
            var $parentElement = $parentItem.find('ul:first');
            var $treeItem = $parentElement.find('li.file-item:first');
            if ($treeItem.length) {
                var fileName = filePath.replace(parentPath+'/', '');
                var resource_url = flaskcode.config.get('resourceUrlTemplate').replace('__pathname__', filePath);
                $parentElement.prepend(
                    $treeItem.clone().removeClass('dir-item').addClass('file-item selected').text(fileName).attr({
                        'title': fileName,
                        'data-path-name': filePath,
                        'data-url': resource_url,
                    }).data({
                        pathName: filePath,
                        url: resource_url,
                    })
                );
                if ($parentItem.hasClass('collapsed')) {
                    $parentItem.click();
                }
            }
        }
    }
    $('#editor-header #resource-name').text(flaskcode.strTruncateLeft(filePath, 40)).attr('title', filePath);
};

flaskcode.notifyCursorPosition = function (position) {
    if (position) {
        $('span#line_num').text(position.lineNumber);
        $('span#column_num').text(position.column);
    } else {
        $('span#line_num').text('');
        $('span#column_num').text('');
    }
};

flaskcode.notifyLanguage = function (lang) {
    if (lang && lang.aliases.length) {
        $('span#editor_lang').text(lang.aliases[0]);
    } else {
        $('span#editor_lang').text('');
    }
};

flaskcode.onEditorStateChange = function (state) {
    var activeTab = flaskcode.tabs.getActiveTab();
    if (activeTab) {
        activeTab.state = state;
        flaskcode.tabs.updateTabModified(activeTab.id);
    }
};

flaskcode.onEditorSave = function (editor) {
    var activeTab = flaskcode.tabs.getActiveTab();
    if (!activeTab || activeTab.state != flaskcode.editorStates.MODIFIED) {
        return null;
    }

    var filePath = activeTab.filePath;
    var isNewResource = activeTab.isNewResource;

    if (!window.FormData) {
        flaskcode.notifyEditor('This browser does not support editor save', 'error');
    } else if (!filePath) {
        flaskcode.notifyEditor('Editor is not initialized properly. Reload page and try again.', 'error');
    } else {
        var prevState = activeTab.state;
        var data = new FormData();
        data.set('resource_data', editor.getValue());
        data.set('is_new_resource', Number(isNewResource));

        $.ajax({
            type: 'POST',
            url: flaskcode.config.get('updateResourceBaseUrl') + filePath,
            data: data,
            cache: false,
            processData: false,
            contentType: false,
            beforeSend: function (xhr, settings) {
                flaskcode.setEditorState(flaskcode.editorStates.BUSY);
                activeTab.state = flaskcode.editorStates.BUSY;
                flaskcode.$editorLoader.addClass('transparent').show();
            },
            success: function (data, status, xhr) {
                if (status == 'success' && data.success) {
                    flaskcode.setEditorState(flaskcode.editorStates.LOADED);
                    activeTab.state = flaskcode.editorStates.LOADED;
                    activeTab.isNewResource = false;
                    flaskcode.tabs.updateTabModified(activeTab.id);
                    flaskcode.showSaveNotification();
                    if (activeTab.isNewResource) {
                        flaskcode.highlightSelectedResource(
                            filePath,
                            flaskcode.dirname(filePath).replace(/^\/+|\/+$/gm,'')
                        );
                    }
                } else {
                    flaskcode.setEditorState(prevState);
                    flaskcode.notifyEditor(data.message || 'Error!', 'error');
                }
            },
            error: function (xhr, status, err) {
                flaskcode.setEditorState(prevState);
                flaskcode.notifyEditor('Error: ' + err, 'error');
            },
            complete: function (xhr, status) {
                flaskcode.$editorLoader.hide().removeClass('transparent');
            },
        });
    }
    return null;
};

flaskcode.setEditorEvents = function (editor) {
    // save action
    editor.addAction({
        id: 'save',
        label: 'Save',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
        precondition: '!editorReadonly',
        keybindingContext: '!editorReadonly',
        contextMenuGroupId: '1_modification',
        contextMenuOrder: 1.5,
        run: flaskcode.onEditorSave,
    });

    // reload action
    editor.addAction({
        id: 'reload',
        label: 'Reload',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyR],
        precondition: null,
        keybindingContext: null,
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 1,
        run: function (ed) {
            var activeTab = flaskcode.tabs.getActiveTab();
            if (!activeTab) {
                ed.focus();
                return;
            }
            
            if (
                activeTab.state == flaskcode.editorStates.INIT ||
                activeTab.state == flaskcode.editorStates.LOADED
            ) {
                flaskcode.loadEditor({
                    url: activeTab.url,
                    filePath: activeTab.filePath
                }, true);
            } else if (activeTab.state == flaskcode.editorStates.MODIFIED) {
                alert('Current changes not saved.');
                ed.focus();
            }
        },
    });

    // force reload action
    editor.addAction({
        id: 'force-reload',
        label: 'Force Reload',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyR],
        precondition: null,
        keybindingContext: null,
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 1.1,
        run: function (ed) {
            var activeTab = flaskcode.tabs.getActiveTab();
            if (!activeTab || activeTab.state == flaskcode.editorStates.BUSY) {
                return;
            }
            flaskcode.loadEditor({
                url: activeTab.url,
                filePath: activeTab.filePath
            }, true);
        },
    });

    // change event
    editor.onDidChangeModelContent(function (e) {
        flaskcode.setEditorState(flaskcode.editorStates.MODIFIED);
        var activeTab = flaskcode.tabs.getActiveTab();
        if (activeTab) {
            activeTab.state = flaskcode.editorStates.MODIFIED;
            flaskcode.tabs.updateTabModified(activeTab.id);
        }
    });

    // cursor position change
    editor.onDidChangeCursorPosition(function (e) {
        flaskcode.notifyCursorPosition(e.position);
    });

    // state change event
    flaskcode.onStateChange = flaskcode.onEditorStateChange;
};

flaskcode.createEditor = function () {
    flaskcode.editorWidget.editor = monaco.editor.create(flaskcode.editorElement, {
        theme: flaskcode.editorTheme(),
        minimap: {enabled: flaskcode.minimapEnabled()},
        fontSize: flaskcode.editorFontSize(),
        model: null,
    });
    flaskcode.setEditorEvents(flaskcode.editorWidget.editor);
};

flaskcode.initEditorBody = function (editorId, resource, isNewResource) {
    flaskcode.$editorContainer.data('editorId', editorId);
    flaskcode.$editorContainer.data('url', resource.url);
    flaskcode.$editorContainer.data('filePath', resource.filePath);
    flaskcode.$editorContainer.data('isNewResource', !!isNewResource);
    flaskcode.highlightSelectedResource(resource.filePath);
    return flaskcode.$editorBody;
};

flaskcode.resetEditorBody = function () {
    flaskcode.$editorContainer.data('editorId', null);
    flaskcode.$editorContainer.data('url', null);
    flaskcode.$editorContainer.data('filePath', null);
    flaskcode.$editorContainer.data('isNewResource', false);
    return flaskcode.$editorBody.empty();
};

flaskcode.saveResourceState = function () {
    if (
        flaskcode.editorWidget.editor &&
        flaskcode.editorWidget.editor.getModel() &&
        flaskcode.editorWidget.resourceName
    ) {
        flaskcode.storage.set(
            flaskcode.editorWidget.resourceName,
            JSON.stringify(flaskcode.editorWidget.editor.saveViewState())
        );
    }
};

flaskcode.restoreResourceState = function () {
    if (
        flaskcode.editorWidget.editor &&
        flaskcode.editorWidget.editor.getModel() &&
        flaskcode.editorWidget.resourceName &&
        flaskcode.storage.get(flaskcode.editorWidget.resourceName)
    ) {
        var viewState = JSON.parse(flaskcode.storage.get(flaskcode.editorWidget.resourceName));
        // Bug: https://github.com/microsoft/monaco-editor/issues/4904
        delete viewState.contributionsState['editor.contrib.wordHighlighter'];
        flaskcode.editorWidget.editor.restoreViewState(viewState);
    }
};

flaskcode.setEditor = function (data, resource, isNewResource) {
    var resourceLang = flaskcode.getLanguageByExtension(flaskcode.getResourceExt(resource.url) ||
            resource.extension || flaskcode.defaultExt) || flaskcode.getLanguageByMimetype(resource.mimetype);
    var lang = resourceLang || flaskcode.defaultLang;

    if (!flaskcode.editorWidget.editor) {
        flaskcode.resetEditorBody();
        flaskcode.createEditor();
    }

    // Create or get tab
    var tabId = flaskcode.tabs.createTab(resource);
    var tab = flaskcode.tabs.tabs[tabId];
    tab.isNewResource = !!isNewResource;

    // Create or reuse model
    var model = tab.model;
    if (!model) {
        model = monaco.editor.createModel(data, lang.id);
        tab.model = model;
    } else {
        model.setValue(data);
        monaco.editor.setModelLanguage(model, lang.id);
    }

    // Set model in editor
    flaskcode.editorWidget.editor.setModel(model);
    flaskcode.editorWidget.resourceName = resource.url;
    
    // Restore view state if available (from tab or localStorage)
    if (tab.viewState) {
        flaskcode.editorWidget.editor.restoreViewState(tab.viewState);
    } else {
        // Try to restore from localStorage for initial load
        flaskcode.restoreResourceState();
        // Save the restored state to tab
        if (flaskcode.editorWidget.editor) {
            tab.viewState = flaskcode.editorWidget.editor.saveViewState();
        }
    }
    
    flaskcode.initEditorBody(flaskcode.editorWidget.editor.getId(), resource, isNewResource);

    flaskcode.setEditorState(flaskcode.editorStates.LOADED);
    tab.state = flaskcode.editorStates.LOADED;
    flaskcode.tabs.updateTabModified(tabId);
    flaskcode.editorWidget.editor.focus();
    flaskcode.notifyCursorPosition(flaskcode.editorWidget.editor.getPosition());
    flaskcode.notifyLanguage(lang);
};

flaskcode.clearEditor = function (altContent) {
    if (flaskcode.editorWidget.editor) {
        if (flaskcode.editorWidget.editor.getModel()) {
            flaskcode.editorWidget.editor.getModel().dispose();
        }
        flaskcode.editorWidget.editor.dispose();
        flaskcode.editorWidget.editor = null;
        flaskcode.editorWidget.resourceName = null;
        flaskcode.setEditorState(flaskcode.editorStates.INIT);
    }
    flaskcode.resetEditorBody().append(altContent || '');
    flaskcode.notifyCursorPosition(null);
    flaskcode.notifyLanguage(null);
};

flaskcode.loadEditor = function (resource, forceReload, isNewResource) {
    // Check if file is already open in a tab
    var existingTabId = flaskcode.tabs.getTabId(resource.url);
    
    if (!forceReload && existingTabId) {
        // Switch to existing tab
        flaskcode.tabs.switchToTab(existingTabId);
        flaskcode.editorWidget.editor.focus();
        return false;
    }
    
    // Check for unsaved changes in current tab
    var activeTab = flaskcode.tabs.getActiveTab();
    if (!forceReload && activeTab && activeTab.state === flaskcode.editorStates.MODIFIED) {
        if (!confirm('Current changes not saved. Are you sure to move on without saving?')) {
            return false;
        }
    }
    
    if (isNewResource) {
        flaskcode.setEditor('', resource, isNewResource);
    } else {
        $.ajax({
            type: 'GET',
            url: resource.url,
            dataType: 'text',
            cache: false,
            beforeSend: function (xhr, settings) {
                flaskcode.$editorLoader.show();
            },
            success: function (data, status, xhr) {
                if (status == 'success') {
                    resource.mimetype = xhr.getResponseHeader('X-File-Mimetype');
                    resource.extension = xhr.getResponseHeader('X-File-Extension');
                    resource.encoding = xhr.getResponseHeader('X-File-Encoding');
                    flaskcode.setEditor(data, resource, isNewResource);
                } else {
                    flaskcode.clearEditor(
                        flaskcode.editorBodyMsg('<h1 class="text-center">Error while loading file !</h1>')
                    );
                }
            },
            error: function (xhr, status, err) {
                flaskcode.clearEditor(
                    flaskcode.editorBodyMsg(
                        '<h1 class="text-center">Error while loading file !</h1>'+
                        '<h2 class="text-center text-danger">'+err+'</h2>'
                    )
                );
            },
            complete: function (xhr, status) {
                flaskcode.$editorLoader.hide();
            },
        });
    }
};

flaskcode.validResource = function (filename) {
    var ext = flaskcode.getExt(filename);
    var lang = ext ? flaskcode.getLanguageByExtension(ext) : null;
    return lang ? flaskcode.allowedLangIds.indexOf(lang.id) > -1 : false;
};

flaskcode.openResource = function ($resourceElement) {
    if (
        !flaskcode.validResource($resourceElement.data('pathName')) &&
        !confirm('Unknown file type ! Are you sure to open it ?')
    ) {
        return false;
    } else {
        flaskcode.loadEditor({
            url: $resourceElement.data('url'),
            filePath: $resourceElement.data('pathName')
        });
        return true;
    }
};

flaskcode.openRenameModal = function ($resourceElement) {
    console.log('openRenameModal called', $resourceElement);
    var $modal = $('#renameFileModal');
    
    if (!$modal.length) {
        console.error('Rename modal not found in DOM');
        alert('Rename modal not found. Please refresh the page.');
        return;
    }
    
    var filePath = $resourceElement.data('pathName') || '';
    var fileName = filePath.split('/').pop() || filePath;
    
    console.log('File path:', filePath, 'File name:', fileName);
    
    // Extract just the filename without extension for easier editing
    var nameWithoutExt = fileName;
    var lastDot = fileName.lastIndexOf('.');
    if (lastDot > 0) {
        nameWithoutExt = fileName.substring(0, lastDot);
    }
    
    $modal.find('#rename_old_path').val(filePath);
    $modal.find('#rename_filename').val(fileName);
    $modal.find('.form-msg').empty();
    
    console.log('Showing rename modal');
    $modal.modal({show: true, backdrop: 'static'});
    
    // Select the filename part (without extension) for easier editing
    setTimeout(function() {
        var $input = $modal.find('#rename_filename');
        if ($input.length && $input[0]) {
            if (lastDot > 0) {
                $input[0].setSelectionRange(0, lastDot);
            } else {
                $input.select();
            }
        }
    }, 300);
};

flaskcode.openNewFileModal = function ($resourceElement) {
    var $modal = $('#fileNameModal');
    $modal.find('.modal-title').text('Create New File');
    
    // Get initial directory from resource element
    var initialPath = $resourceElement.data('pathName') || '';
    var initialUrl = $resourceElement.data('url') || '';
    
    // If it's a file path, extract the directory
    if (initialPath && !$resourceElement.hasClass('dir-item')) {
        var lastSlash = initialPath.lastIndexOf('/');
        if (lastSlash > 0) {
            initialPath = initialPath.substring(0, lastSlash);
        } else {
            initialPath = '';
        }
    }
    
    // Populate directory dropdown
    flaskcode.populateDirectorySelector(initialPath);
    
    // Set initial values
    var baseUrl = initialUrl.replace(/\.txt$/i, '');
    if (initialPath && !baseUrl) {
        // Try to find URL from directory element
        var $dirElement = $('ul#dir-tree .dir-item[data-path-name="' + initialPath + '"]').first();
        if ($dirElement.length) {
            baseUrl = $dirElement.data('url') || '';
            baseUrl = baseUrl.replace(/\.txt$/i, '');
        }
    }
    
    $modal.find('#base_url').val(baseUrl);
    $modal.find('#base_path_name').val(initialPath);
    $modal.find('.base-path-name').text(initialPath || 'Root');
    $modal.find('#new_filename').val('');
    
    // Handle directory selection change
    $modal.find('#new_file_directory').off('change').on('change', function() {
        var selectedPath = $(this).val() || '';
        // Find the directory element to get its URL
        var $dirElement = $('ul#dir-tree .dir-item[data-path-name="' + selectedPath + '"]').first();
        var dirUrl = '';
        if ($dirElement.length) {
            dirUrl = $dirElement.data('url') || '';
            dirUrl = dirUrl.replace(/\.txt$/i, '');
        } else if (selectedPath === '') {
            // Root directory - construct URL from first directory or use empty
            var $firstDir = $('ul#dir-tree .dir-item').first();
            if ($firstDir.length) {
                var firstUrl = $firstDir.data('url') || '';
                var firstPath = $firstDir.data('pathName') || '';
                if (firstPath.includes('/')) {
                    var rootPath = firstPath.substring(0, firstPath.indexOf('/'));
                    dirUrl = firstUrl.substring(0, firstUrl.indexOf('/' + rootPath.split('/').pop()));
                }
            }
        }
        
        $modal.find('#base_url').val(dirUrl);
        $modal.find('#base_path_name').val(selectedPath);
        $modal.find('.base-path-name').text(selectedPath || 'Root');
    });
    
    $modal.modal({show: true, backdrop: 'static'});
};

flaskcode.populateDirectorySelector = function(selectedPath) {
    var $selector = $('#new_file_directory');
    $selector.empty();
    
    // Get all directory items from the tree
    var directories = [];
    var pathSet = new Set();
    
    $('ul#dir-tree .dir-item').each(function() {
        var pathName = $(this).data('pathName');
        if (pathName !== undefined && pathName !== null && pathName !== '') {
            if (!pathSet.has(pathName)) {
                pathSet.add(pathName);
                directories.push({
                    path: pathName,
                    name: $(this).text().trim() || pathName.split('/').pop() || pathName
                });
            }
        }
    });
    
    // Also add root directory (empty path)
    if (!pathSet.has('')) {
        directories.push({
            path: '',
            name: 'Root'
        });
    }
    
    // Sort directories by path length first, then alphabetically
    directories.sort(function(a, b) {
        if (a.path === '') return -1;
        if (b.path === '') return 1;
        if (a.path.length !== b.path.length) {
            return a.path.length - b.path.length;
        }
        return a.path.localeCompare(b.path);
    });
    
    // Add all directories to selector
    directories.forEach(function(dir) {
        var displayName = dir.path || 'Root';
        var $option = $('<option value="' + dir.path + '">' + displayName + '</option>');
        if (dir.path === selectedPath) {
            $option.prop('selected', true);
        }
        $selector.append($option);
    });
    
    // If no directories found, add a default option
    if (directories.length === 0) {
        $selector.append($('<option value="">No directories available</option>'));
    }
};
