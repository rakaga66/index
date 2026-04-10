const fs = require('fs');

function cleanFile(path) {
    if (!fs.existsSync(path)) return;
    let content = fs.readFileSync(path, 'utf8');
    // Regex matches ? or ？ followed by optional spaces and a quote
    let cleaned = content.replace(/[？?]\s*"/g, '"');
    fs.writeFileSync(path, cleaned, 'utf8');
    console.log(`Cleaned: ${path}`);
}

cleanFile('q702.html');
cleanFile('questionsData.js');
