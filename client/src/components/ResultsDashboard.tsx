import { motion } from "framer-motion";
import { type QueryWithResponses } from "@shared/routes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Brain, Code, Terminal, Palette, MessageCircle, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ResultsDashboardProps {
  data: QueryWithResponses;
}

export function ResultsDashboard({ data }: ResultsDashboardProps) {
  const orchestrator = data.responses.find(r => r.modelName === 'gpt-orchestrator');
  const technical = data.responses.find(r => r.modelName === 'claude-technical');
  const creative = data.responses.find(r => r.modelName === 'gemini-creative');
  const social = data.responses.find(r => r.modelName === 'grok-social');
  const casual = data.responses.find(r => r.modelName === 'llama-casual');

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <motion.div 
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-6 w-full max-w-5xl mx-auto pb-12"
    >
      {/* Orchestrator Summary - Full Width */}
      <motion.div variants={item} className="col-span-full">
        <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-card shadow-2xl shadow-primary/5">
          <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-primary to-accent"></div>
          <div className="p-6 md:p-8">
            <div className="flex items-center gap-3 mb-4">
              <Brain className="w-6 h-6 text-primary" />
              <h2 className="text-xl font-bold font-display text-white">Orchestrator Summary</h2>
              <Badge variant="outline" className="border-primary/50 text-primary bg-primary/10 ml-auto">
                GPT-4o
              </Badge>
            </div>
            <div className="prose prose-invert max-w-none text-muted-foreground/90 leading-relaxed">
              {data.orchestratorSummary || orchestrator?.content || "Orchestrating analysis..."}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Model Perspectives Grid */}
      <motion.div variants={item}>
        <h3 className="text-lg font-semibold text-white/80 mb-4 flex items-center gap-2">
          <BarChart3 className="w-5 h-5" />
          Perspective Analysis
        </h3>
        
        <Tabs defaultValue="technical" className="w-full">
          <TabsList className="w-full justify-start h-auto bg-transparent border-b border-white/10 p-0 rounded-none mb-6 overflow-x-auto">
            <TabsTrigger 
              value="technical" 
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-[#F97316] data-[state=active]:text-[#F97316] rounded-none px-6 py-3 border-b-2 border-transparent"
            >
              <Terminal className="w-4 h-4 mr-2" />
              Technical
            </TabsTrigger>
            <TabsTrigger 
              value="social" 
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-[#0EA5E9] data-[state=active]:text-[#0EA5E9] rounded-none px-6 py-3 border-b-2 border-transparent"
            >
              <MessageCircle className="w-4 h-4 mr-2" />
              Social
            </TabsTrigger>
            <TabsTrigger 
              value="creative" 
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-[#D946EF] data-[state=active]:text-[#D946EF] rounded-none px-6 py-3 border-b-2 border-transparent"
            >
              <Palette className="w-4 h-4 mr-2" />
              Creative
            </TabsTrigger>
            <TabsTrigger 
              value="casual" 
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-[#22C55E] data-[state=active]:text-[#22C55E] rounded-none px-6 py-3 border-b-2 border-transparent"
            >
              <Code className="w-4 h-4 mr-2" />
              Casual
            </TabsTrigger>
          </TabsList>

          <div className="min-h-[300px]">
            <TabsContent value="technical" className="mt-0">
              <PerspectiveCard 
                title="Technical Analysis" 
                model="Claude 3.5 Sonnet" 
                content={technical?.content} 
                icon={Terminal}
                color="text-[#F97316]"
                borderColor="border-[#F97316]/20"
              />
            </TabsContent>
            
            <TabsContent value="social" className="mt-0">
              <PerspectiveCard 
                title="Social Sentiment" 
                model="Grok (Simulated)" 
                content={social?.content} 
                icon={MessageCircle}
                color="text-[#0EA5E9]"
                borderColor="border-[#0EA5E9]/20"
              />
            </TabsContent>

            <TabsContent value="creative" className="mt-0">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <PerspectiveCard 
                  title="Creative Concept" 
                  model="Gemini Pro" 
                  content={creative?.content} 
                  icon={Palette}
                  color="text-[#D946EF]"
                  borderColor="border-[#D946EF]/20"
                />
                {/* Image Placeholder or Actual Image */}
                <Card className="bg-card border-white/10 overflow-hidden">
                   {creative?.metadata && typeof creative.metadata === 'object' && 'imageUrl' in creative.metadata ? (
                     <div className="h-full min-h-[300px] w-full relative">
                        <img 
                          src={(creative.metadata as any).imageUrl} 
                          alt="Generated visual" 
                          className="w-full h-full object-cover"
                        />
                     </div>
                   ) : (
                     <div className="h-full min-h-[300px] flex items-center justify-center bg-black/20 text-muted-foreground flex-col gap-3">
                       <Palette className="w-8 h-8 opacity-20" />
                       <span className="text-sm">No visual generated</span>
                     </div>
                   )}
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="casual" className="mt-0">
              <PerspectiveCard 
                title="Casual Explanation" 
                model="LLaMA 3 (Simulated)" 
                content={casual?.content} 
                icon={Code}
                color="text-[#22C55E]"
                borderColor="border-[#22C55E]/20"
              />
            </TabsContent>
          </div>
        </Tabs>
      </motion.div>
    </motion.div>
  );
}

function PerspectiveCard({ title, model, content, icon: Icon, color, borderColor }: any) {
  return (
    <Card className={cn("bg-card border shadow-lg h-full", borderColor)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-lg font-medium text-white flex items-center gap-2">
          <Icon className={cn("w-5 h-5", color)} />
          {title}
        </CardTitle>
        <Badge variant="secondary" className="bg-white/5 text-white/70 hover:bg-white/10">
          {model}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="prose prose-invert max-w-none text-sm leading-relaxed text-muted-foreground">
          {content || (
            <div className="flex items-center gap-2 animate-pulse text-muted-foreground/50">
              Waiting for response...
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
