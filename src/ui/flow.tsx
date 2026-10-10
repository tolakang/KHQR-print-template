/**
 * Flow view: the same panels as the card layout, arranged as nodes on a
 * pan-and-zoom canvas (React Flow). Assets, Data, Typography and Export each
 * wire into the Preview, which wires into Download; Data also feeds the rows table. Node positions are kept
 * per browser; the engine and the settings are shared with the card view.
 */
import { useCallback, useRef, useState, type ReactNode } from 'react'
import {
  ReactFlow, Background, BackgroundVariant, Controls, MiniMap, Handle, Position,
  applyNodeChanges, type Edge, type Node, type NodeChange, type NodeProps, type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useUi } from '../store/ui'
import { AssetsPanel, DataPanel, TypographyPanel, ExportPanel } from './panels'
import { Preview, RowsTable } from './preview'
import { Image as ImageIcon, Table as TableIcon, Type as TypeIcon, FileOut, Reset, Download as DownloadIcon } from './icons'
import { ExportBar } from './exportBar'
import { btnCls } from './controls'

type Kind = 'assets' | 'data' | 'typography' | 'export' | 'preview' | 'download' | 'rows'
type FlowNodeData = { kind: Kind }

const DEFAULT_LAYOUT: Record<Kind, { x: number; y: number }> = {
  assets: { x: 0, y: 0 },
  export: { x: 0, y: 900 },
  data: { x: 420, y: 0 },
  typography: { x: 420, y: 1080 },
  preview: { x: 900, y: 0 },
  download: { x: 1540, y: 0 },
  rows: { x: 900, y: 820 },
}

/**
 * Every wire has its own pair of connection points: `top` is the handle's
 * vertical position on the node edge (CSS). Inputs sit on the left, outputs on the right.
 */
interface Port { id: string; top: string }
const INPUTS: Partial<Record<Kind, Port[]>> = {
  preview: [{ id: 'assets', top: '16%' }, { id: 'data', top: '27%' }, { id: 'typography', top: '38%' }, { id: 'export', top: '49%' }],
  download: [{ id: 'preview', top: '56px' }],
  rows: [{ id: 'data', top: '50%' }],
}
// Outputs of collapsible cards sit on the card header (title strip ~22 px + header ~68 px),
// so wires stay attached when a card is collapsed.
const HEADER = 56
const OUTPUTS: Partial<Record<Kind, Port[]>> = {
  assets: [{ id: 'preview', top: `${HEADER}px` }],
  export: [{ id: 'preview', top: `${HEADER}px` }],
  data: [{ id: 'preview', top: `${HEADER - 9}px` }, { id: 'rows', top: `${HEADER + 9}px` }],
  typography: [{ id: 'preview', top: `${HEADER}px` }],
  preview: [{ id: 'download', top: `${HEADER}px` }],
}

// Settings (assets, data, typography, export) feed the Preview; the Preview feeds Download.
const EDGES: Edge[] = [
  ['assets', 'preview'], ['data', 'preview'], ['typography', 'preview'], ['export', 'preview'], ['preview', 'download'], ['data', 'rows'],
].map(([source, target]) => ({
  id: `${source}-${target}`,
  source,
  target,
  sourceHandle: `out-${target}`,
  targetHandle: `in-${source}`,
  animated: true,
  style: { stroke: '#8f8f99', strokeWidth: 1.5 },
}))

const handleCls = '!h-2.5 !w-2.5 !border !border-white !bg-brand'

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

const card = 'rounded-2xl border border-black/[0.06] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-6px_rgba(0,0,0,0.12)]'

function FlowNode({ data }: NodeProps<Node<FlowNodeData>>) {
  const k = data.kind
  let body: ReactNode
  switch (k) {
    case 'assets': body = <div className="w-[360px]"><Grip icon={<ImageIcon className="h-3.5 w-3.5" />} title="Assets" /><AssetsPanel /></div>; break
    case 'data': body = <div className="w-[360px]"><Grip icon={<TableIcon className="h-3.5 w-3.5" />} title="Data" /><DataPanel /></div>; break
    case 'typography': body = <div className="w-[360px]"><Grip icon={<TypeIcon className="h-3.5 w-3.5" />} title="Typography" /><TypographyPanel /></div>; break
    case 'export': body = <div className="w-[360px]"><Grip icon={<FileOut className="h-3.5 w-3.5" />} title="Export" /><ExportPanel /></div>; break
    case 'preview':
      body = (
        <div className="w-[560px]">
          <Grip icon={<ImageIcon className="h-3.5 w-3.5" />} title="Preview" />
          <div className={`${card} nowheel h-[740px] overflow-hidden bg-canvas`}><Preview fill /></div>
        </div>
      )
      break
    case 'download':
      body = (
        <div className="w-[340px]">
          <Grip icon={<DownloadIcon className="h-3.5 w-3.5" />} title="Download" />
          <div className={`${card} space-y-3 p-4`}>
            <p className="text-xs leading-snug text-stone-500">Builds the PDF from the preview settings: download it, or open the print dialog.</p>
            <ExportBar stacked />
          </div>
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
      {INPUTS[k]?.map((p) => <Handle key={p.id} id={`in-${p.id}`} type="target" position={Position.Left} style={{ top: p.top }} className={handleCls} />)}
      {body}
      {OUTPUTS[k]?.map((p) => <Handle key={p.id} id={`out-${p.id}`} type="source" position={Position.Right} style={{ top: p.top }} className={handleCls} />)}
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
  // Phones open on the Preview node; the whole graph would be too small to use.
  const [fitOptions] = useState(() => (window.matchMedia('(max-width: 767px)').matches ? { nodes: [{ id: 'preview' }], padding: 0.04 } : { padding: 0.08 }))
  const reset = () => {
    resetLayout()
    setNodes(makeNodes({}))
    requestAnimationFrame(() => flow.current?.fitView({ ...fitOptions, duration: 300 }))
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
        fitViewOptions={fitOptions}
        minZoom={0.2}
        maxZoom={1.5}
        nodesConnectable={false}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
        className="bg-canvas"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.4} color="#c8c8c8" />
        <Controls showInteractive={false} position="bottom-left" className="!rounded-xl !border !border-stone-200 !shadow-md [&_button]:!border-stone-100" />
        <MiniMap position="bottom-right" pannable zoomable className="max-md:!hidden !rounded-xl !border !border-stone-200 !shadow-md" nodeColor={(n) => (n.id === 'preview' ? '#d22026' : '#ffffff')} nodeStrokeColor="#d4d4d4" maskColor="rgba(240,240,240,0.7)" />
      </ReactFlow>
      <button type="button" className={`${btnCls('secondary', 'sm')} absolute right-4 top-4 z-10 bg-white`} onClick={reset}>
        <Reset className="h-3.5 w-3.5" />Reset layout
      </button>
    </div>
  )
}
