(function () {
  'use strict';

  var tooLargeMessage = "Those photos are too large to send together. Please remove a few and try again, or send the form without photos and we'll ask for them by email.";

  async function decodeImage(file) {
    if (typeof window.createImageBitmap === 'function') {
      try {
        var bitmap = await window.createImageBitmap(file);
        return { image: bitmap, release: function () { bitmap.close(); } };
      } catch (_) {
        // Try the browser's Image decoder when ImageBitmap cannot read the file.
      }
    }

    var url = URL.createObjectURL(file);
    try {
      var img = await new Promise(function (resolve, reject) {
        var image = new Image();
        image.onload = function () { resolve(image); };
        image.onerror = function () { reject(new Error('Unable to decode photo.')); };
        image.src = url;
      });
      return { image: img, release: function () { URL.revokeObjectURL(url); } };
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
  }

  async function compressImage(file) {
    var decoded, canvas;
    try {
      decoded = await decodeImage(file);
      var image = decoded.image;
      var width = image.naturalWidth || image.width;
      var height = image.naturalHeight || image.height;
      var scale = Math.min(1, 2000 / Math.max(width, height));
      canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      var context = canvas.getContext('2d');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      var blob = await new Promise(function (resolve) {
        canvas.toBlob(resolve, 'image/jpeg', 0.8);
      });
      if (!blob) return file;
      return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', {
        type: 'image/jpeg', lastModified: file.lastModified
      });
    } catch (_) {
      // Unsupported formats, including HEIC in some browsers, keep their original bytes.
      return file;
    } finally {
      if (decoded) decoded.release();
      if (canvas) { canvas.width = 0; canvas.height = 0; }
    }
  }

  window.tycBuildFormData = async function (form) {
    var data = new FormData(form);
    var files = data.getAll('attachment');
    data.delete('attachment');
    var totalSize = 0;

    // Process one photo at a time to avoid holding several decoded phone photos in memory.
    for (var file of files) {
      if (file instanceof File) {
        if (!file.name && !file.size) continue;
        if (/^image\/(jpe?g|png|webp|hei[cf])$/i.test(file.type) || /\.(jpe?g|png|webp|hei[cf])$/i.test(file.name)) {
          file = await compressImage(file);
        }
        totalSize += file.size;
      }
      data.append('attachment', file);
    }

    if (totalSize > 4000000) throw new Error(tooLargeMessage);
    return data;
  };
  window.tycBuildFormData.tooLargeMessage = tooLargeMessage;
}());
