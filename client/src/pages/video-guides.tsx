import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Play,
  Search,
  Clock,
  Video,
  BookOpen,
  Upload,
  Palette,
  FileText,
  Settings,
  Layers,
  ShoppingCart,
} from "lucide-react";

interface VideoGuide {
  id: string;
  title: string;
  description: string;
  category: string;
  duration?: string;
  youtubeId?: string;
  videoUrl?: string;
}

const VIDEO_CATEGORIES = [
  { id: "all", label: "All Guides", icon: BookOpen },
  { id: "getting-started", label: "Getting Started", icon: Play },
  { id: "uploading", label: "Uploading Artwork", icon: Upload },
  { id: "design", label: "Design & Layout", icon: Palette },
  { id: "pdf-output", label: "PDF Output", icon: FileText },
  { id: "templates", label: "Templates", icon: Layers },
  { id: "ordering", label: "Ordering", icon: ShoppingCart },
  { id: "advanced", label: "Advanced Features", icon: Settings },
];

const PLACEHOLDER_VIDEOS: VideoGuide[] = [
  {
    id: "1",
    title: "Getting Started with the Upload Tool",
    description: "Learn how to navigate the upload tool, create a new project, and understand the 5-step workflow.",
    category: "getting-started",
    duration: "3:00",
  },
  {
    id: "2",
    title: "Uploading Your Artwork",
    description: "How to upload logos and artwork files including PDF, SVG, and image formats.",
    category: "uploading",
    duration: "2:30",
  },
  {
    id: "3",
    title: "Choosing Templates and Sizes",
    description: "Browse available templates, select the right size for your garment, and understand template groups.",
    category: "templates",
    duration: "2:00",
  },
  {
    id: "4",
    title: "Positioning and Scaling Logos",
    description: "Use the canvas tools to position, scale, and rotate your logos on the garment template.",
    category: "design",
    duration: "4:00",
  },
  {
    id: "5",
    title: "Selecting Garment Colors",
    description: "Choose garment colors for your order and set quantities for each color.",
    category: "design",
    duration: "2:00",
  },
  {
    id: "6",
    title: "Generating Production PDFs",
    description: "Preview and download production-ready PDF files for your artwork order.",
    category: "pdf-output",
    duration: "2:00",
  },
  {
    id: "7",
    title: "Adding to Cart and Ordering",
    description: "Add your completed artwork to the cart and place your order.",
    category: "ordering",
    duration: "2:00",
  },
  {
    id: "8",
    title: "Using Shape Tools",
    description: "Add borders, badges, and decorative shapes to your design using the built-in shape tools.",
    category: "advanced",
    duration: "3:00",
  },
  {
    id: "9",
    title: "Applique Templates and Dual Canvas",
    description: "Work with applique templates using the dual-canvas system for badge and embroidery artwork.",
    category: "advanced",
    duration: "4:00",
  },
  {
    id: "10",
    title: "Repeat Orders and ZIP Uploads",
    description: "How to place repeat applique orders using ZIP file uploads.",
    category: "ordering",
    duration: "3:00",
  },
];

function VideoCard({ video }: { video: VideoGuide }) {
  const hasVideo = video.youtubeId || video.videoUrl;

  return (
    <Card className="bg-zinc-900 border-zinc-700 hover:border-zinc-500 transition-all group cursor-pointer">
      <div className="relative aspect-video bg-zinc-800 rounded-t-lg flex items-center justify-center overflow-hidden">
        {video.youtubeId ? (
          <iframe
            src={`https://www.youtube.com/embed/${video.youtubeId}`}
            title={video.title}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div className="flex flex-col items-center gap-3 text-zinc-500">
            <div className="w-16 h-16 rounded-full bg-zinc-700/50 flex items-center justify-center group-hover:bg-blue-600/20 transition-colors">
              <Play className="w-8 h-8 text-zinc-400 group-hover:text-blue-400 transition-colors ml-1" />
            </div>
            <span className="text-xs">Video coming soon</span>
          </div>
        )}
        {video.duration && (
          <Badge className="absolute bottom-2 right-2 bg-black/70 text-white text-xs border-0">
            <Clock className="w-3 h-3 mr-1" />
            {video.duration}
          </Badge>
        )}
      </div>
      <CardContent className="p-4">
        <h3 className="font-semibold text-white text-sm mb-1 line-clamp-2">{video.title}</h3>
        <p className="text-zinc-400 text-xs line-clamp-2">{video.description}</p>
      </CardContent>
    </Card>
  );
}

export default function VideoGuides() {
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredVideos = PLACEHOLDER_VIDEOS.filter((video) => {
    const matchesCategory = activeCategory === "all" || video.category === activeCategory;
    const matchesSearch =
      !searchQuery ||
      video.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      video.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/">
            <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Video className="w-5 h-5 text-blue-400" />
            <h1 className="text-xl font-bold">Video Guides</h1>
          </div>
          <Badge variant="outline" className="border-zinc-600 text-zinc-400 text-xs">
            {PLACEHOLDER_VIDEOS.length} guides
          </Badge>
        </div>

        <p className="text-zinc-400 text-sm mb-6 max-w-2xl">
          Step-by-step video tutorials to help you get the most out of the artwork upload tool. 
          From uploading your first logo to generating production-ready PDFs.
        </p>

        <div className="relative mb-6 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            placeholder="Search guides..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500"
          />
        </div>

        <div className="flex gap-2 flex-wrap mb-6">
          {VIDEO_CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            return (
              <Button
                key={cat.id}
                variant={activeCategory === cat.id ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveCategory(cat.id)}
                className={
                  activeCategory === cat.id
                    ? "bg-blue-600 hover:bg-blue-700 text-white border-blue-600"
                    : "border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 bg-transparent"
                }
              >
                <Icon className="w-3.5 h-3.5 mr-1.5" />
                {cat.label}
              </Button>
            );
          })}
        </div>

        {filteredVideos.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredVideos.map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
          </div>
        ) : (
          <Card className="bg-zinc-900 border-zinc-700">
            <CardContent className="flex flex-col items-center justify-center py-16 text-zinc-500">
              <Video className="w-12 h-12 mb-3 text-zinc-600" />
              <p className="text-sm">No guides found matching your search.</p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 text-blue-400"
                onClick={() => {
                  setSearchQuery("");
                  setActiveCategory("all");
                }}
              >
                Clear filters
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
