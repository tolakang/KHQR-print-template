/**
 * Flow view: the same panels as the card layout, arranged as nodes on a
 * pan-and-zoom canvas (React Flow). Inputs feed the Sticker node, which feeds
 * the Preview, the Export settings and the rows table. Node positions are kept
 * per browser; the engine and the settings are shared with the card view.
 */
import { useCallback, useRef, useState, type ReactNode } from 'react'
import {
  ReactFlow, Background, BackgroundVariant, Controls, MiniMap, Handle, Position,
  applyNodeChanges, type Edge, type Node, type NodeChange, type NodeProps, type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useUi } from '../store/ui'
import { useApp } from '../store/app'
import { useSettings } from '../store/settings'
import { AssetsPanel, DataPanel, TypographyPanel, ExportPanel } from './panels'
import { Preview, RowsTable, useRows } from './preview'
import { Image as ImageIcon, Table as TableIcon, Type as TypeIcon, FileOut, Reset } from './icons'
import { btnCls } from './controls'

type Kind = 'assets' | 'data' | 'typography' | 'sticker' | 'preview' | 'export' | 'rows'
type FlowNodeData = { kind: Kind }

const DEFAULT_LAYOUT: Record<Kind, { x: number; y: number }> = {
  assets: { x: 0, y: 0 },
  data: { x: 420, y: 0 },
  typography: { x: 420, y: 1080 },
  sticker: { x: 860, y: 380 },
  preview: { x: 1140, y: 0 },
  export: { x: 1760, y: 0 },
  rows: { x: 1140, y: 820 },
}

const IN: Record<Kind, boolean> = { assets: false, data: false, typography: false, sticker: true, preview: true, export: true, rows: true }
const OUT: Record<Kind, boolean> = { assets: true, data: true, typography: true, sticker: true, preview: false, export: false, rows: false }

const EDGES: Edge[] = [
  ['assets', 'sticker'], ['data', 'sticker'], ['typography', 'sticker'],
  ['sticker', 'preview'], ['sticker', 'export'], ['data', 'rows'],
].map(([source, target]) => ({ id: `${source}-${target}`, source, target, animated: true, style: { stroke: '#b1b1b7', strokeWidth: 1.5 } }))

const handleCls = '!h-3 !w-3 !border-2 !border-white !bg-brand shadow-sm'

/** Title strip the node is dragged by; the body stays fully interactive. */
function Grip({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flow-drag flex cursor-grab items-center gap-2 px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-500 active:cursor-grabbing">
      <span className="text-brand">{icon}</span>
      {title}
      <span className="ml-auto flex items-center gap-1 normal-case tracking-normal">{children}</span>
      <span aria-hidden className="text-stone-300">⋮⋮</span>
    </div>
  )
}

function StickerHub() {
  const s = useSettings((x) => x.s)
  const { rows } = useRows()
  const hasSheet = useApp((x) => x.sheets.length > 0)
  const size = s.pageSize === 'original' ? 'Original' : s.pageSize === 'custom' ? `${s.customMm.w}×${s.customMm.h} mm` : s.pageSize
  return (
    <div className="w-56 rounded-2xl border-2 border-brand bg-white p-4 shadow-[0_8px_24px_-6px_rgba(210,32,38,0.35)]">
      <div className="flow-drag cursor-grab text-center active:cursor-grabbing">
        <img src="/artwork/khqr-logo.svg" alt="" className="mx-auto h-5" />
        <div className="mt-1.5 text-sm font-bold text-stone-900">Sticker</div>
      </div>
      <dl className="mt-3 space-y-1 text-xs">
        <div className="flex justify-between"><dt className="text-stone-500">Rows</dt><dd className="font-semibold tabular-nums">{hasSheet ? rows.length : 'sample'}</dd></div>
        <div className="flex justify-between"><dt className="text-stone-500">Page</dt><dd className="font-semibold">{size}{s.bleed ? ' + bleed' : ''}</dd></div>
        <div className="flex justify-between"><dt className="text-stone-500">Background</dt><dd className="font-semibold">{s.background ? 'on' : 'off'}</dd></div>
      </dl>
    </div>
  )
}

const card = 'rounded-2xl border border-black/[0.06] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-6px_rgba(0,0,0,0.12)]'

function FlowNode({ data }: NodeProps<Node<FlowNodeData>>) {
  const k = data.kind
  let body: ReactNode
  switch (k) {
    case 'assets': body = <div className="w-[360px]"><Grip icon={<ImageIcon className="h-3.5 w-3.5" />} title="Assets" /><AssetsPanel /></div>; break
    case 'data': body = <div className="w-[360px]"><Grip icon={<TableIcon className="h-3.5 w-3.5" />} title="Data" /><DataPanel /></div>; break
    case 'typography': body = <div className="w-[360px]"><Grip icon={<TypeIcon className="h-3.5 w-3.5" />} title="Typography" /><TypographyPanel /></div>; break
    case 'export': body = <div className="w-[360px]"><Grip icon={<FileOut className="h-3.5 w-3.5" />} title="Export" /><ExportPanel /></div>; break
    case 'sticker': body = <StickerHub />; break
    case 'preview':
      body = (
        <div className="w-[560px]">
          <Grip icon={<ImageIcon className="h-3.5 w-3.5" />} title="Preview" />
          <div className={`${card} nowheel h-[740px] overflow-hidden bg-canvas`}><Preview /></div>
        </div>
      )
      break
    case 'rows':
      body = (
        <div className="w-[800px]">
          <Grip icon={<TableIcon className="h-3.5 w-3.5" />} title="Rows" />
          <div className={`${card} nowheel h-[360px] overflow-hidden`}><RowsTable /></div>
        </div>
      )
      break
  }
  return (
    <>
      {IN[k] && <Handle type="target" position={Position.Left} className={handleCls} />}
      {body}
      {OUT[k] && <Handle type="source" position={Position.Right} className={handleCls} />}
    </>
  )
}

const nodeTypes = { panel: FlowNode }

const makeNodes = (positions: Record<string, { x: number; y: number }>): Node<FlowNodeData>[] =>
  (Object.keys(DEFAULT_LAYOUT) as Kind[]).map((kind) => ({
    id: kind,
    type: 'panel',
    position: positions[kind] ?? DEFAULT_LAYOUT[kind],
    data: { kind },
    dragHandle: '.flow-drag',
  }))

export function FlowView() {
  const setPosition = useUi((x) => x.setPosition)
  const resetLayout = useUi((x) => x.resetLayout)
  const [nodes, setNodes] = useState(() => makeNodes(useUi.getState().positions))
  const onNodesChange = useCallback((changes: NodeChange<Node<FlowNodeData>>[]) => setNodes((n) => applyNodeChanges(changes, n)), [])
  const flow = useRef<ReactFlowInstance<Node<FlowNodeData>> | null>(null)
  const reset = () => {
    resetLayout()
    setNodes(makeNodes({}))
    requestAnimationFrame(() => flow.current?.fitView({ padding: 0.08, duration: 300 }))
  }

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={EDGES}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={(_, node) => setPosition(node.id, node.position)}
        onInit={(i) => { flow.current = i }}
        fitView
        fitViewOptions={{ padding: 0.08 }}
        minZoom={0.2}
        maxZoom={1.5}
        nodesConnectable={false}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
        className="bg-canvas"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.4} color="#c8c8c8" />
        <Controls showInteractive={false} position="bottom-left" className="!rounded-xl !border !border-stone-200 !shadow-md [&_button]:!border-stone-100" />
        <MiniMap position="bottom-right" pannable zoomable className="!rounded-xl !border !border-stone-200 !shadow-md" nodeColor={(n) => (n.id === 'sticker' ? '#d22026' : '#ffffff')} nodeStrokeColor="#d4d4d4" maskColor="rgba(240,240,240,0.7)" />
      </ReactFlow>
      <button type="button" className={`${btnCls('secondary', 'sm')} absolute right-4 top-4 z-10 bg-white`} onClick={reset}>
        <Reset className="h-3.5 w-3.5" />Reset layout
      </button>
    </div>
  )
}
