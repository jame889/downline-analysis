'use client'

import {
  ChevronRight,
  Focus,
  Paintbrush,
  Rotate3D,
  Search,
  Undo2,
  Users,
} from 'lucide-react'
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import PlacementNetwork3D, { type PlacementTreeNode } from './PlacementNetwork3D'

interface MyData {
  member?: { id: string; name: string }
  treeNodes?: PlacementTreeNode[]
  sponsorDirectory?: SponsorMember[]
  month?: string
  months?: string[]
  error?: string
}

interface SponsorMember {
  id: string
  name: string
  sponsor_id?: string | null
  sponsor_name?: string
  upline_id: string | null
  is_active: number
  highest_position: string
}

const CORE_STORAGE_PREFIX = 'downline-5-core'

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString()
}

export default function SimulatorPage() {
  const [nodes, setNodes] = useState<PlacementTreeNode[]>([])
  const [sponsorDirectory, setSponsorDirectory] = useState<SponsorMember[]>([])
  const [months, setMonths] = useState<string[]>([])
  const [month, setMonth] = useState('')
  const [originalRootId, setOriginalRootId] = useState('')
  const [rootId, setRootId] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())
  const [coreIds, setCoreIds] = useState<Set<string>>(new Set())
  const [paintMode, setPaintMode] = useState(false)
  const [maxDepth, setMaxDepth] = useState(3)
  const [search, setSearch] = useState('')
  const [searchError, setSearchError] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const loadData = useCallback(async (targetMonth?: string) => {
    setLoading(true)
    setLoadError('')
    try {
      const query = targetMonth ? `?month=${encodeURIComponent(targetMonth)}` : ''
      const response = await fetch(`/api/my${query}`, { cache: 'no-store' })
      const data = await response.json() as MyData
      if (!response.ok) throw new Error(data.error || 'โหลดข้อมูลไม่สำเร็จ')

      const nextNodes = data.treeNodes ?? []
      const nextRoot = data.member?.id ?? nextNodes[0]?.id ?? ''
      const nextMonth = data.month ?? targetMonth ?? ''

      setNodes(nextNodes)
      setSponsorDirectory(data.sponsorDirectory ?? nextNodes)
      setMonths(data.months ?? [])
      setMonth(nextMonth)
      setOriginalRootId(nextRoot)
      setRootId(nextRoot)
      setSelectedId(nextRoot)
      setCollapsedIds(new Set())
      setSearch('')
      setSearchError('')
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'โหลดข้อมูลไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    if (!originalRootId || !month) return
    const key = `${CORE_STORAGE_PREFIX}:${originalRootId}:${month}`
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? '[]') as string[]
      setCoreIds(new Set(saved.filter((id) => nodes.some((node) => node.id === id))))
    } catch {
      setCoreIds(new Set())
    }
  }, [month, nodes, originalRootId])

  useEffect(() => {
    if (!originalRootId || !month) return
    const key = `${CORE_STORAGE_PREFIX}:${originalRootId}:${month}`
    try {
      localStorage.setItem(key, JSON.stringify(Array.from(coreIds)))
    } catch {
      // The 3D view remains usable when browser storage is unavailable.
    }
  }, [coreIds, month, originalRootId])

  const nodeMap = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes]
  )

  const selectedNode = nodeMap.get(selectedId) ?? nodeMap.get(rootId) ?? null
  const sponsoredMembers = useMemo(
    () => selectedNode
      ? sponsorDirectory
          .filter((node) => node.sponsor_id === selectedNode.id)
          .sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.name.localeCompare(b.name))
      : [],
    [selectedNode, sponsorDirectory]
  )

  function findAndFocus(event?: FormEvent) {
    event?.preventDefault()
    const query = search.trim().toLowerCase()
    if (!query) return

    const found = nodeMap.get(search.trim())
      ?? nodes.find((node) => node.name.toLowerCase().includes(query))

    if (!found) {
      setSearchError(`ไม่พบ "${search.trim()}" ในองค์กรนี้`)
      return
    }

    setRootId(found.id)
    setSelectedId(found.id)
    setCollapsedIds(new Set())
    setSearch(found.id)
    setSearchError('')
  }

  function resetRoot() {
    setRootId(originalRootId)
    setSelectedId(originalRootId)
    setCollapsedIds(new Set())
    setSearch('')
    setSearchError('')
  }

  function toggleNode(node: PlacementTreeNode) {
    setSelectedId(node.id)
    if (!nodes.some((item) => item.upline_id === node.id)) return
    setCollapsedIds((current) => {
      const next = new Set(current)
      if (next.has(node.id)) next.delete(node.id)
      else next.add(node.id)
      return next
    })
  }

  function toggleCore(node: PlacementTreeNode) {
    setSelectedId(node.id)
    setCoreIds((current) => {
      const next = new Set(current)
      if (next.has(node.id)) next.delete(node.id)
      else next.add(node.id)
      return next
    })
  }

  return (
    <div className="-mx-4 -my-6">
      <section className="relative min-h-[720px] h-[calc(100vh-3.5rem)] overflow-hidden bg-[#080b10]">
        {loading ? (
          <div className="absolute inset-0 grid place-items-center text-slate-400">
            <div className="text-center">
              <Rotate3D className="mx-auto mb-3 h-9 w-9 animate-spin text-cyan-400" />
              <p>กำลังสร้างโครงสร้าง 3D...</p>
            </div>
          </div>
        ) : loadError ? (
          <div className="absolute inset-0 grid place-items-center px-6 text-center">
            <div>
              <p className="font-semibold text-red-300">{loadError}</p>
              <button
                type="button"
                onClick={() => void loadData(month || undefined)}
                className="mt-4 rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500"
              >
                ลองอีกครั้ง
              </button>
            </div>
          </div>
        ) : nodes.length === 0 ? (
          <div className="absolute inset-0 grid place-items-center text-slate-400">
            ไม่พบข้อมูลโครงสร้างในเดือนนี้
          </div>
        ) : (
          <PlacementNetwork3D
            nodes={nodes}
            rootId={rootId}
            selectedId={selectedId}
            collapsedIds={collapsedIds}
            coreIds={coreIds}
            paintMode={paintMode}
            maxDepth={maxDepth}
            onSelect={setSelectedId}
            onToggleCollapse={toggleNode}
            onToggleCore={toggleCore}
          />
        )}

        <div className="absolute inset-x-3 top-3 z-10 flex flex-col gap-2 md:inset-x-auto md:left-3 md:w-[330px]">
          <div className="rounded-lg border border-white/10 bg-slate-950/90 p-3 shadow-xl backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-base font-bold text-white">Placement Simulator 3D</h1>
                <p className="mt-0.5 text-xs text-slate-400">
                  {month || '-'} · {nodes.length.toLocaleString()} คน
                </p>
              </div>
              <Rotate3D className="h-5 w-5 shrink-0 text-cyan-400" />
            </div>

            <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
              <select
                value={month}
                onChange={(event) => void loadData(event.target.value)}
                className="min-w-0 rounded-md border border-slate-700 bg-slate-900 px-2.5 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500"
                aria-label="เลือกเดือน"
              >
                {months.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
              <select
                value={maxDepth}
                onChange={(event) => setMaxDepth(Number(event.target.value))}
                className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500"
                aria-label="จำนวนชั้นที่แสดง"
              >
                {[3, 4, 5, 6, 7, 8, 10, 12].map((depth) => (
                  <option key={depth} value={depth}>{depth} ชั้น</option>
                ))}
              </select>
            </div>

            <form onSubmit={findAndFocus} className="mt-2">
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value)
                      setSearchError('')
                    }}
                    placeholder="รหัสหรือชื่อสมาชิก"
                    className="w-full rounded-md border border-slate-700 bg-slate-900 py-2 pl-8 pr-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-500"
                  />
                </div>
                <button
                  type="submit"
                  title="ค้นหาและเริ่มโครงสร้างจากสมาชิกนี้"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-cyan-600 text-white hover:bg-cyan-500"
                >
                  <Focus className="h-4 w-4" />
                </button>
              </div>
              {searchError && <p className="mt-1.5 text-xs text-red-400">{searchError}</p>}
            </form>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPaintMode((value) => !value)}
                className={`flex h-9 items-center justify-center gap-2 rounded-md border text-xs font-semibold transition-colors ${
                  paintMode
                    ? 'border-cyan-400 bg-cyan-950 text-cyan-300'
                    : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600'
                }`}
              >
                <Paintbrush className="h-4 w-4" />
                {paintMode ? 'แต้ม 5 Core อยู่' : 'แต้ม 5 Core'}
              </button>
              <button
                type="button"
                onClick={resetRoot}
                disabled={rootId === originalRootId}
                className="flex h-9 items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-900 text-xs font-semibold text-slate-300 hover:border-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Undo2 className="h-4 w-4" />
                กลับ Root
              </button>
            </div>
          </div>

          {selectedNode && (
            <div className="hidden max-h-[40vh] overflow-y-auto rounded-lg border border-white/10 bg-slate-950/90 p-3 shadow-xl backdrop-blur md:block">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-cyan-300">{selectedNode.id}</p>
                    {coreIds.has(selectedNode.id) && (
                      <span className="rounded border border-cyan-500 bg-cyan-950 px-1.5 py-0.5 text-[10px] font-bold text-cyan-300">
                        5 CORE
                      </span>
                    )}
                  </div>
                  <p className="truncate text-sm font-semibold text-white">{selectedNode.name}</p>
                </div>
                <span className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs font-bold text-amber-300">
                  {selectedNode.highest_position || 'FA'}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-md bg-black/30 p-2.5">
                  <p className="text-[10px] text-slate-500">BV ซ้าย</p>
                  <p className="mt-0.5 font-bold text-emerald-400">{formatNumber(selectedNode.total_vol_left)}</p>
                </div>
                <div className="rounded-md bg-black/30 p-2.5">
                  <p className="text-[10px] text-slate-500">BV ขวา</p>
                  <p className="mt-0.5 font-bold text-fuchsia-400">{formatNumber(selectedNode.total_vol_right)}</p>
                </div>
              </div>

              <div className="mt-3 space-y-1.5 text-xs">
                <p className="text-slate-400">
                  Sponsor: <span className="text-slate-200">{selectedNode.sponsor_name || selectedNode.sponsor_id || '-'}</span>
                </p>
                <p className="text-slate-400">
                  สถานะ: <span className={selectedNode.is_active ? 'text-emerald-400' : 'text-slate-500'}>
                    {selectedNode.is_active ? 'Active' : 'Inactive'}
                  </span>
                </p>
              </div>

              <div className="mt-3 border-t border-slate-800 pt-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                    <Users className="h-3.5 w-3.5" />
                    ผู้ถูกแนะนำ
                  </p>
                  <span className="text-[10px] text-slate-500">{sponsoredMembers.length} คน</span>
                </div>
                {sponsoredMembers.length === 0 ? (
                  <p className="py-2 text-center text-xs text-slate-600">ยังไม่มีข้อมูล</p>
                ) : (
                  <div className="space-y-1">
                    {sponsoredMembers.map((member) => (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => {
                          setRootId(member.id)
                          setSelectedId(member.id)
                          setSearch(member.id)
                          setCollapsedIds(new Set())
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-slate-900"
                      >
                        <span className={`h-2 w-2 shrink-0 rounded-full ${member.is_active ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                        <span className="min-w-0 flex-1 truncate text-xs text-slate-300">
                          {member.id} · {member.name}
                        </span>
                        <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex flex-wrap gap-2 text-[10px] text-slate-300">
          {[
            ['bg-emerald-400', 'Active'],
            ['bg-slate-500', 'Inactive'],
            ['bg-violet-400', 'ยุบสายงาน'],
            ['bg-cyan-400', '5 Core'],
            ['bg-amber-300', 'เลือกอยู่'],
          ].map(([color, label]) => (
            <span key={label} className="flex items-center gap-1.5 rounded bg-black/60 px-2 py-1 backdrop-blur">
              <span className={`h-2 w-2 rounded-full ${color}`} />
              {label}
            </span>
          ))}
        </div>

        {selectedNode && (
          <div className="absolute inset-x-3 bottom-12 z-10 rounded-lg border border-white/10 bg-slate-950/90 p-3 shadow-xl backdrop-blur md:hidden">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{selectedNode.id} · {selectedNode.name}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {selectedNode.highest_position || 'FA'} · {selectedNode.is_active ? 'Active' : 'Inactive'} · Sponsor {selectedNode.sponsor_name || '-'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setRootId(selectedNode.id)
                  setCollapsedIds(new Set())
                }}
                title="เริ่มโครงสร้างจากสมาชิกนี้"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-slate-700 bg-slate-900 text-cyan-300"
              >
                <Focus className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
