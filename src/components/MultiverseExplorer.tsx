import React, { useEffect, useMemo, useState } from 'react';
import {
  Background, BackgroundVariant, Controls, MiniMap, Node, NodeProps,
  Edge, ReactFlow, Handle, Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { GitBranch, MessageSquare, Sparkles, Star, X } from 'lucide-react';
import { useAppStore } from '../store';
import {
  buildMultiverseGraph, MvSceneData, MvVariantData, useAuraV2Store,
} from '../stores/useAuraV2Store';
import { cn } from '../utils/cn';

type SceneNode = Node<MvSceneData & Record<string, unknown>, 'scene'>;
type VariantNode = Node<MvVariantData & Record<string, unknown>, 'variant'>;

/* ------------------------------------------------------------------ */
/* Custom nodes                                                        */
/* ------------------------------------------------------------------ */

const SceneNodeView = ({ data, selected }: NodeProps<SceneNode>) => (
  <div
    className={cn(
      'w-72 rounded-xl border bg-surface/95 backdrop-blur px-3.5 py-2.5 shadow-md transition-shadow cursor-pointer',
      selected ? 'border-accent ring-2 ring-accent/50 shadow-xl' : 'border-app-border hover:border-accent/50',
      data.isCurrent && 'ring-2 ring-accent border-accent shadow-[0_0_24px_-4px_var(--app-accent)]',
    )}
    title="Click to snap the reader here"
  >
    <Handle type="target" position={Position.Top} className="!bg-app-border !border-0 !w-2 !h-2" />
    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted mb-1">
      <span className="font-bold text-accent tabular-nums">#{data.chainIndex + 1}</span>
      <span className="truncate">{data.speaker}</span>
      {data.starred && <Star size={10} className="text-amber-500 fill-amber-500 shrink-0" />}
      {data.branchCount > 0 && (
        <span className="flex items-center gap-0.5 shrink-0">
          <GitBranch size={10} /> {data.branchCount}
        </span>
      )}
      <span className="ml-auto flex items-center gap-0.5 shrink-0">
        <MessageSquare size={10} /> {data.messageCount}
      </span>
    </div>
    <p className="text-xs leading-snug line-clamp-2 opacity-90">{data.preview || '(empty)'}</p>
    {data.isCurrent === true && (
      <div className="mt-1.5 text-[9px] font-bold uppercase tracking-widest text-accent">
        ● You are here
      </div>
    )}
    <Handle type="source" position={Position.Bottom} className="!bg-app-border !border-0 !w-2 !h-2" />
  </div>
);

const VariantNodeView = ({ data, selected }: NodeProps<VariantNode>) => (
  <div
    className={cn(
      'w-60 rounded-lg border px-3 py-2 shadow-sm transition-all cursor-pointer text-xs',
      data.active
        ? 'border-accent bg-accent/10 opacity-100'
        : 'border-app-border/70 bg-surface/80 opacity-60 hover:opacity-100 border-dashed',
      selected && 'ring-2 ring-accent/50',
    )}
    title={data.active ? 'The version you are reading' : 'Click to read this version instead'}
  >
    <Handle type="target" position={Position.Left} className="!bg-app-border !border-0 !w-1.5 !h-1.5" />
    <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted mb-0.5">
      <Sparkles size={9} className={cn(data.active && 'text-accent')} />
      What-if {data.swipeIndex + 1}
      {data.active && <span className="text-accent font-bold">· reading</span>}
    </div>
    <p className="leading-snug line-clamp-2 opacity-90">{data.preview || '(empty)'}</p>
    <Handle type="source" position={Position.Right} className="!bg-app-border !border-0 !w-1.5 !h-1.5" />
  </div>
);

const nodeTypes = { scene: SceneNodeView, variant: VariantNodeView };

/* ------------------------------------------------------------------ */
/* Explorer                                                            */
/* ------------------------------------------------------------------ */

/**
 * Full-screen map of the story's timelines. The spine is the main path;
 * every swipe/alternate greeting fans out as a "what-if" node. Clicking
 * any node snaps the reader there instantly (variants also re-weave the
 * branch path). Rendering is virtualized, so even multi-thousand-scene
 * saves stay smooth.
 */
export const MultiverseExplorer = () => {
  const open = useAuraV2Store(s => s.multiverseOpen);
  const setOpen = useAuraV2Store(s => s.setMultiverseOpen);
  const selectGraphNode = useAuraV2Store(s => s.selectGraphNode);
  const chains = useAppStore(s => s.chains);
  const swipeSelections = useAppStore(s => s.swipeSelections);
  const currentChainIndex = useAppStore(s => s.currentChainIndex);
  const [toast, setToast] = useState<string | null>(null);

  const graph = useMemo(() => {
    if (!open) return null;
    return buildMultiverseGraph(chains, swipeSelections, currentChainIndex);
  }, [open, chains, swipeSelections, currentChainIndex]);

  const { nodes, edges } = useMemo(() => {
    if (!graph) return { nodes: [] as Node[], edges: [] as Edge[] };
    const nodes: Node[] = graph.nodes.map(n => ({
      id: n.id,
      type: n.data.type,
      position: { x: n.x, y: n.y },
      data: {
        ...n.data,
        isCurrent: n.id === graph.currentSceneId,
      } as Record<string, unknown>,
      draggable: false,
      connectable: false,
    }));
    const edges: Edge[] = graph.edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      animated: false,
      style: e.onPath
        ? { stroke: 'var(--app-accent)', strokeWidth: 2, opacity: 0.9 }
        : { stroke: 'var(--app-border)', strokeWidth: 1.5, strokeDasharray: '4 4', opacity: 0.6 },
    }));
    return { nodes, edges };
  }, [graph]);

  const branchTotal = useMemo(
    () => (graph ? graph.nodes.filter(n => n.data.type === 'variant').length : 0),
    [graph],
  );

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1600);
    return () => clearTimeout(t);
  }, [toast]);

  if (!open || !graph) return null;

  const onNodeClick = (_e: React.MouseEvent, node: Node) => {
    const data = node.data as unknown as MvSceneData | MvVariantData;
    selectGraphNode(data);
    setToast(data.type === 'variant'
      ? `Now reading what-if ${data.swipeIndex + 1} of scene ${data.chainIndex + 1}`
      : `Snapped to scene ${data.chainIndex + 1}`);
  };

  return (
    <div className="fixed inset-0 z-50 bg-app-bg text-app-text flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-app-border bg-surface/85 backdrop-blur-md">
        <GitBranch size={18} className="text-accent" />
        <div className="min-w-0">
          <h2 className="font-bold leading-tight">Multiverse</h2>
          <p className="text-[11px] text-muted leading-tight">
            {chains.length} scene{chains.length === 1 ? '' : 's'}
            {branchTotal > 0
              ? ` · ${branchTotal} what-ifs — click any node to read that timeline`
              : ' — click a scene to jump there'}
          </p>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm hover:bg-app-text/5 transition-colors"
          title="Back to reading (Esc)"
        >
          <X size={16} /> Close
        </button>
      </div>

      <div className="flex-1 min-h-0">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          fitView
          fitViewOptions={{ nodes: [{ id: graph.currentSceneId }], maxZoom: 1, padding: 2.5 }}
          minZoom={0.05}
          maxZoom={1.75}
          onlyRenderVisibleElements
          nodesDraggable={false}
          nodesConnectable={false}
          edgesFocusable={false}
          proOptions={{ hideAttribution: true }}
          className="!bg-transparent"
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={28}
            size={1.5}
            color="var(--app-border)"
          />
          <Controls
            showInteractive={false}
            className="!bg-surface !border !border-app-border !shadow-lg [&>button]:!bg-surface [&>button]:!border-app-border [&>button]:!text-app-text [&>button:hover]:!bg-app-text/10 [&_svg]:!fill-current"
          />
          {/* The minimap itself becomes the bottleneck on huge graphs. */}
          {nodes.length <= 1200 && (
            <MiniMap
              pannable
              zoomable
              className="!bg-surface !border !border-app-border !rounded-lg overflow-hidden"
              maskColor="color-mix(in srgb, var(--app-bg) 75%, transparent)"
              nodeColor={(n) =>
                (n.data as any).isCurrent
                  ? 'var(--app-accent)'
                  : n.type === 'variant'
                    ? 'color-mix(in srgb, var(--app-accent) 45%, transparent)'
                    : 'var(--app-border)'}
            />
          )}
        </ReactFlow>
      </div>

      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-full bg-app-text text-app-bg text-sm font-medium shadow-xl pointer-events-none">
          {toast}
        </div>
      )}
    </div>
  );
};
