/* eslint-disable no-undef */

// Prevent multiple injections
if (!window.__COMET_INJECTED__) {
  window.__COMET_INJECTED__ = true;

  let inputRef = null;

  document.addEventListener('keydown', async (event) => {
    try {
      console.log(event.key, 'event.key', {
        ctrl: event.ctrlKey,
        meta: event.metaKey,
      });

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
            // Copy (allow default behavior but log it)
            console.log('✓ Copy triggered');
            // Don't prevent default - let browser handle copy
            break;
          }

          case 'x': {
            // Cut (allow default behavior but log it)
            console.log('✓ Cut triggered');
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
