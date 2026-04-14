/* ============================================
   TORONTO YACHT CLUB — Main JS
   ============================================ */

// Mobile nav toggle
document.addEventListener('DOMContentLoaded', function () {
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.getElementById('main-nav');

  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      const isOpen = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', isOpen);
      toggle.innerHTML = isOpen ? '&times;' : '&#9776;';
    });

    // Close nav when a link is clicked (mobile)
    nav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.innerHTML = '&#9776;';
      });
    });
  }

  // Lightbox for gallery
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxClose = document.querySelector('.lightbox-close');

  if (lightbox) {
    document.querySelectorAll('.gallery-item[data-full]').forEach(function (item) {
      item.addEventListener('click', function () {
        const src = this.getAttribute('data-full') || this.querySelector('img')?.src;
        if (src) {
          lightboxImg.src = src;
          lightboxImg.alt = this.querySelector('img')?.alt || 'Photo';
          lightbox.classList.add('active');
          document.body.style.overflow = 'hidden';
        }
      });
    });

    if (lightboxClose) {
      lightboxClose.addEventListener('click', closeLightbox);
    }

    lightbox.addEventListener('click', function (e) {
      if (e.target === lightbox) closeLightbox();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeLightbox();
    });

    function closeLightbox() {
      lightbox.classList.remove('active');
      lightboxImg.src = '';
      document.body.style.overflow = '';
    }
  }
});
