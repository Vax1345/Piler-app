import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { type AgentId } from "@shared/schema";

interface AgentCardProps {
  id: AgentId;
  name: string;
  role: string;
  description: string;
  emoji: string;
  borderColor: string;
  hoverBg: string;
  onClick: (id: AgentId) => void;
  isSelected?: boolean;
}

export function AgentCard({ 
  id, 
  name, 
  role, 
  description, 
  emoji,
  borderColor,
  hoverBg,
  onClick,
  isSelected 
}: AgentCardProps) {
  return (
    <motion.div
      whileHover={{ y: -5, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onClick(id)}
      data-testid={`card-agent-${id}`}
      className={cn(
        "cursor-pointer group relative overflow-hidden rounded-2xl border-t-[5px] border bg-card p-6 transition-all duration-300",
        borderColor,
        isSelected 
          ? "ring-2 ring-primary/20 shadow-xl border-l-border border-r-border border-b-border" 
          : "border-l-border border-r-border border-b-border shadow-sm hover:shadow-md",
        !isSelected && hoverBg
      )}
    >
      <div className="relative z-10 flex flex-col items-center text-center space-y-4">
        <span className="text-5xl block transition-transform duration-300 group-hover:scale-110">
          {emoji}
        </span>
        
        <div>
          <h3 className="font-display text-xl font-bold text-foreground">{name}</h3>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-1 block">
            {role}
          </span>
        </div>
        
        <p className="text-sm text-muted-foreground leading-relaxed max-w-[200px]">
          {description}
        </p>
      </div>
    </motion.div>
  );
}
