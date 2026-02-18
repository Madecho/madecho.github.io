module.exports = {
  content: ["_site/**/*.html", "_site/**/*.js"],
  css: ["_site/assets/css/*.css"],
  output: "_site/assets/css/",
  skippedContentGlobs: ["_site/assets/**/*.html"],
  // Keep layout and content classes so main page content is never clipped
  safelist: {
    standard: [
      "post", "clearfix", "post-header", "post-title", "desc",
      "container", "mt-5", "row", "col-sm-9", "col-sm-3",
      "profile", "float-right", "float-left", "more-info", "profile-social",
      "site-name-first", "site-name-rest"
    ],
  },
};
