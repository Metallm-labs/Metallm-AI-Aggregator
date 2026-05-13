document.addEventListener('DOMContentLoaded', function () {
  var sidebarLinks = document.querySelectorAll('.sidebar-nav a');
  var sections = document.querySelectorAll('[data-section]');
  var sidebar = document.querySelector('.sidebar');
  var sidebarToggle = document.querySelector('.sidebar-toggle');

  // Sidebar toggle for mobile
  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', function () {
      sidebar.classList.toggle('open');
    });
  }

  // Close sidebar when a link is clicked on mobile
  sidebarLinks.forEach(function (link) {
    link.addEventListener('click', function () {
      if (window.innerWidth <= 768) {
        sidebar.classList.remove('open');
      }
    });
  });

  // Collapsible sidebar sections
  var toggleButtons = document.querySelectorAll('.sidebar-section-toggle');
  toggleButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var content = this.nextElementSibling;
      var isCollapsed = this.classList.contains('collapsed');
      if (isCollapsed) {
        this.classList.remove('collapsed');
        content.classList.remove('collapsed');
      } else {
        this.classList.add('collapsed');
        content.classList.add('collapsed');
      }
    });
  });

  // Scroll spy - highlight active section in sidebar
  function updateActiveLink() {
    var scrollPos = window.scrollY + 120;

    sections.forEach(function (section) {
      var top = section.offsetTop;
      var height = section.offsetHeight;
      var id = section.getAttribute('data-section');

      if (scrollPos >= top && scrollPos < top + height) {
        sidebarLinks.forEach(function (link) {
          link.classList.remove('active');
          if (link.getAttribute('href') === '#' + id) {
            link.classList.add('active');
          }
        });
      }
    });
  }

  window.addEventListener('scroll', updateActiveLink);
  updateActiveLink();

  // Smooth scroll for sidebar links (only same-page hash links)
  sidebarLinks.forEach(function (link) {
    link.addEventListener('click', function (e) {
      var href = this.getAttribute('href');
      if (!href || href.indexOf('.html') !== -1) {
        return;
      }
      if (href.charAt(0) === '#') {
        e.preventDefault();
        var targetId = href.substring(1);
        var targetEl = document.querySelector('[data-section="' + targetId + '"]');
        if (targetEl) {
          window.scrollTo({
            top: targetEl.offsetTop - 80,
            behavior: 'smooth'
          });
        }
      }
    });
  });
});
