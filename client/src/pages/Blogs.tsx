// client/src/pages/Blogs.tsx
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, ExternalLink, FileText, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

interface MediumRSSItem {
  creator: string;
  title: string;
  link: string;
  pubDate: string;
  "content:encoded": string;
  "content:encodedSnippet": string;
  guid: string;
  isoDate: string;
}

// Function to extract first image from the content using regex
const extractFirstImage = (content: string) => {
  const imgRegex = /<img[^>]+src="([^">]+)"/;
  const match = content.match(imgRegex);
  return match ? match[1] : "/og-image.jpeg"; // Fallback image if none
};

// Function to safely extract a snippet without tags
const stripHtml = (html: string) => {
  const tmp = document.createElement("DIV");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
};

export default function Blogs() {
  const { data: blogs, isLoading, error } = useQuery<MediumRSSItem[]>({
    queryKey: ["medium-blogs"],
    queryFn: async () => {
      const res = await fetch("/api/blogs");
      if (!res.ok) {
        throw new Error("Failed to load blogs");
      }
      return res.json();
    },
  });

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 max-w-screen-2xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <Link href="/">
              <div className="flex items-center gap-2 cursor-pointer group">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-primary-foreground font-bold shadow-sm group-hover:scale-105 transition-transform">
                  M
                </div>
                <span className="font-semibold text-lg hover:text-primary transition-colors hidden sm:inline-block">
                  MetaLLM
                </span>
              </div>
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm" className="hidden sm:flex">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Home
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10 md:py-16">
        <div className="flex flex-col items-center justify-center text-center space-y-4 mb-12">
          <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-primary/10 text-primary hover:bg-primary/20">
            Articles & Insights
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70 pb-2">
            MetaLLM Blogs
          </h1>
          <p className="text-lg text-muted-foreground max-w-[42rem]">
            Explore the latest product updates, AI model comparisons, prompt engineering tips, and more directly from our Medium channel.
          </p>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-xl font-semibold mb-2">Could not load articles</h3>
            <p className="text-muted-foreground">
              We're having trouble fetching our latest blogs from Medium right now.
            </p>
            <Button
              variant="outline"
              className="mt-6"
              onClick={() => window.open('https://medium.com/@metallm', '_blank')}
            >
              Read on Medium directly <ExternalLink className="w-4 h-4 ml-2" />
            </Button>
          </div>
        )}

        {blogs && blogs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-xl font-semibold mb-2">No articles yet</h3>
            <p className="text-muted-foreground">
              Our first post is coming soon. Stay tuned!
            </p>
          </div>
        )}

        <div className="grid gap-6 md:gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {blogs?.map((blog, index) => {
            const coverImage = extractFirstImage(blog["content:encoded"]);
            const snippet = stripHtml(blog["content:encodedSnippet"] || blog["content:encoded"]).slice(0, 150) + "...";
            const pubDate = new Date(blog.isoDate || blog.pubDate);

            return (
              <a
                key={blog.guid}
                href={blog.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm transition-all hover:shadow-md hover:border-primary/50"
              >
                <div className="aspect-video w-full overflow-hidden bg-muted relative">
                  <img
                    src={coverImage}
                    alt={blog.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading={index === 0 ? "eager" : "lazy"}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div className="flex flex-col flex-1 p-6">
                  <time className="text-sm font-medium text-primary mb-2 block" dateTime={blog.isoDate}>
                    {format(pubDate, "MMMM d, yyyy")}
                  </time>
                  <h3 className="font-semibold text-xl leading-tight mb-3 line-clamp-2 group-hover:text-primary transition-colors">
                    {blog.title}
                  </h3>
                  <p className="text-muted-foreground line-clamp-3 flex-1 text-sm mb-4">
                    {snippet}
                  </p>
                  <div className="flex items-center text-sm font-medium text-foreground group-hover:text-primary mt-auto">
                    Read Full Article
                    <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      </main>

      <footer className="border-t py-8 mt-auto">
        <div className="container max-w-screen-2xl px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-center text-sm leading-loose text-muted-foreground md:text-left">
            &copy; {new Date().getFullYear()} MetaLLM. All rights reserved.
          </p>
          <div className="flex gap-4">
            <Link href="/terms"><span className="text-sm font-medium underline underline-offset-4 cursor-pointer hover:text-primary">Terms</span></Link>
            <Link href="/privacy"><span className="text-sm font-medium underline underline-offset-4 cursor-pointer hover:text-primary">Privacy</span></Link>
            <a href="https://medium.com/@metallm" target="_blank" rel="noopener noreferrer" className="text-sm font-medium underline underline-offset-4 hover:text-primary">Medium</a>
          </div>
        </div>
      </footer>
    </div>
  );
}