document.addEventListener('DOMContentLoaded', function() {
  // Fetch the README.md file from the root directory
  fetch('README.md')
    .then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.text();
    })
    .then(markdown => {
      // Find the content container
      const contentDiv = document.getElementById('content');
      if (contentDiv) {
        // Use marked.js to convert markdown to HTML
        // and insert it into the container
        contentDiv.innerHTML = marked.parse(markdown);
      }
    })
    .catch(error => {
      console.error('There was a problem fetching the README.md file:', error);
      const contentDiv = document.getElementById('content');
      if (contentDiv) {
        contentDiv.innerHTML = '<p>Error loading content. Please try again later.</p>';
      }
    });
});
