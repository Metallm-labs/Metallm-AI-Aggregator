import fs from 'fs';
const file = 'server/bot-prerender.ts';
let code = fs.readFileSync(file, 'utf8');

const targetStr = `case "/":
    default:`;

const blogCode = `case "/blogs":
      return {
        title: "MetaLLM Blogs | Updates & AI Insights",
        description: "Read the latest updates, tutorials, and insights regarding MetaLLM chat workspace, AI model comparisons, prompt engineering, and WhatsApp business agents.",
        canonicalPath: "/blogs",
        schema: [
          {
            "@context": "https://schema.org",
            "@type": "Blog",
            name: "MetaLLM Blogs",
            url: \`\${SITE_URL}/blogs\`,
            description: "Updates, tutorials, and insights from MetaLLM regarding AI."
          }
        ],
        body: \`
          <div class="badge">Blog</div>
          <h1>MetaLLM AI Insights & Updates</h1>
          <p class="lede">Explore our latest articles published straight from our Medium publication.</p>
        \`
      };
    
    `;

if(!code.includes('case "/blogs":')) {
  code = code.replace(targetStr, blogCode + targetStr);
  fs.writeFileSync(file, code);
  console.log("Updated bot-prerender.ts");
} else {
  console.log("Already updated");
}

