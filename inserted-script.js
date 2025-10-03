// Prevent multiple injections
if (!window.__COMET_INJECTED__) {
  window.__COMET_INJECTED__ = true;

  // Initialize event queue for server communication
  if (!window.__SERVER_EVENT_QUEUE__) {
    window.__SERVER_EVENT_QUEUE__ = [];
  }

  // Event emitter for client-to-server communication
  window.emitToServer = function (eventName, data) {
    const event = {
      name: eventName,
      data: data,
      timestamp: Date.now(),
    };

    window.__SERVER_EVENT_QUEUE__.push(event);
    console.log('📤 Emitted to server:', eventName, data);
  };

  let inputRef = null;

  document.addEventListener('keydown', async (event) => {
    try {
      // Check if Ctrl or Meta (Cmd on Mac) is pressed
      const modifierKey = event.ctrlKey || event.metaKey;

      if (modifierKey && inputRef) {
        const key = event.key?.toLowerCase();

        switch (key) {
          case 'v': {
            // Paste
            event.preventDefault();
            const inpJsPath = window.DOMPath.fullQualifiedSelector(inputRef);
            window?.duglas(inpJsPath);

            // Emit paste event to server
            window.emitToServer('paste', {
              url: window.location.href,
              element: inputRef ? inputRef.tagName : null,
              timestamp: new Date().toISOString(),
            });

            console.log('✓ Paste triggered');
            break;
          }

          case 'a': {
            // Select all
            event.preventDefault();
            if (inputRef.isContentEditable) {
              const range = document.createRange();
              range.selectNodeContents(inputRef);
              const selection = window.getSelection();
              selection.removeAllRanges();
              selection.addRange(range);
            } else {
              inputRef.select();
            }
            console.log('✓ Selected all text');
            break;
          }

          case 'c': {
            // Copy - emit event to server
            const selectedText = window.getSelection().toString();
            // Emit copy event to server
            window.emitToServer('copy', {
              text: selectedText,
              url: window.location.href,
              element: inputRef.tagName,
              timestamp: new Date().toISOString(),
            });

            console.log('✓ Copy triggered', {
              textLength: selectedText.length,
            });
            // Don't prevent default - let browser handle copy
            break;
          }

          case 'x': {
            // Cut - emit event to server
            const selectedText = window.getSelection().toString();

            // Emit cut event to server
            window.emitToServer('cut', {
              text: selectedText,
              url: window.location.href,
              element: inputRef.tagName,
              timestamp: new Date().toISOString(),
            });

            console.log('✓ Cut triggered', { textLength: selectedText.length });
            // Don't prevent default - let browser handle cut
            break;
          }

          case 'z': {
            // Undo
            if (inputRef.isContentEditable) {
              event.preventDefault();
              document.execCommand('undo');
              console.log('✓ Undo triggered');
            }
            // For regular inputs, let browser handle it
            break;
          }

          case 'y': {
            // Redo (Ctrl+Y on Windows)
            if (inputRef.isContentEditable) {
              event.preventDefault();
              document.execCommand('redo');
              console.log('✓ Redo triggered');
            }
            break;
          }
        }
      }

      // Handle Ctrl+Shift+Z for Redo (common on Mac)
      if (
        modifierKey &&
        event.shiftKey &&
        event.key?.toLowerCase() === 'z' &&
        inputRef
      ) {
        if (inputRef.isContentEditable) {
          event.preventDefault();
          document.execCommand('redo');
          console.log('✓ Redo triggered (Shift+Z)');
        }
      }
    } catch (error) {
      console.log(error, 'error');
    }
  });

  document.addEventListener('click', (event) => {
    if (
      event.target.tagName === 'INPUT' ||
      event.target.tagName === 'TEXTAREA'
    ) {
      inputRef = event.target;
    } else {
      inputRef = null;
    }
  });

  document.addEventListener('mouseover', (event) => {
    if (event?.target) {
      event.target.style.border = '2px solid red';
    }
  });

  document.addEventListener('mouseout', (event) => {
    if (event?.target && event.target.style) {
      event.target.style.border = '';
    }
  });
}
