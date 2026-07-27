'use client'

import { useState } from 'react'
import { createSupabaseClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Item = {
  id: string
  name: string
  category: string | null
  purchase_date: string | null
  warranty_until: string | null
  location: string | null
  notes: string | null
}

type Event = {
  id: string
  item_id: string | null
  title: string
  event_date: string
  cost: number | null
  notes: string | null
}

const CATEGORIES = ['Värme', 'Vitvaror', 'Tak & fasad', 'VVS', 'El', 'Trädgård', 'Övrigt']

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function ItemsManager({ initialItems, initialEvents }: { initialItems: Item[]; initialEvents: Event[] }) {
  const [items, setItems] = useState(initialItems)
  const [events, setEvents] = useState(initialEvents)
  const [addingItem, setAddingItem] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0])
  const [purchaseDate, setPurchaseDate] = useState('')
  const [warrantyUntil, setWarrantyUntil] = useState('')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  async function addItem(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    const supabase = createSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const { data, error } = await supabase.from('hemkoll_house_items').insert({
      user_id: user.id,
      name: name.trim(),
      category,
      purchase_date: purchaseDate || null,
      warranty_until: warrantyUntil || null,
      location: location.trim() || null,
      notes: notes.trim() || null,
    }).select().single()

    if (!error && data) {
      setItems(prev => [data, ...prev])
      setName(''); setPurchaseDate(''); setWarrantyUntil(''); setLocation(''); setNotes('')
      setAddingItem(false)
      router.refresh()
    }
    setSaving(false)
  }

  async function deleteItem(id: string) {
    const supabase = createSupabaseClient()
    await supabase.from('hemkoll_house_items').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
    setEvents(prev => prev.filter(e => e.item_id !== id))
    router.refresh()
  }

  async function addEvent(itemId: string, title: string, eventDate: string, cost: string, notes: string) {
    if (!title.trim() || !eventDate) return
    const supabase = createSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error } = await supabase.from('hemkoll_events').insert({
      user_id: user.id,
      item_id: itemId,
      title: title.trim(),
      event_date: eventDate,
      cost: cost ? Number(cost) : null,
      notes: notes.trim() || null,
    }).select().single()
    if (!error && data) {
      setEvents(prev => [data, ...prev])
      router.refresh()
    }
  }

  async function deleteEvent(id: string) {
    const supabase = createSupabaseClient()
    await supabase.from('hemkoll_events').delete().eq('id', id)
    setEvents(prev => prev.filter(e => e.id !== id))
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        onClick={() => setAddingItem(v => !v)}
        className="bg-accent text-bg text-sm font-semibold px-4 py-2.5 rounded-xl hover:opacity-90 transition-opacity self-start"
      >
        {addingItem ? 'Avbryt' : '+ Lägg till objekt'}
      </button>

      {addingItem && (
        <form onSubmit={addItem} className="bg-card border border-edge rounded-2xl p-4 flex flex-col gap-3">
          <div>
            <label className="text-muted text-xs uppercase tracking-wider mb-1 block">Namn</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="T.ex. Värmepump, Diskmaskin, Tak"
              className="w-full bg-bg border border-edge rounded-lg px-3 py-2 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-muted text-xs uppercase tracking-wider mb-1 block">Kategori</label>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="w-full bg-bg border border-edge rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus:border-accent">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-muted text-xs uppercase tracking-wider mb-1 block">Plats</label>
              <input value={location} onChange={e => setLocation(e.target.value)} placeholder="T.ex. Källare"
                className="w-full bg-bg border border-edge rounded-lg px-3 py-2 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-muted text-xs uppercase tracking-wider mb-1 block">Inköpsdatum</label>
              <input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)}
                className="w-full bg-bg border border-edge rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="text-muted text-xs uppercase tracking-wider mb-1 block">Garanti t.o.m.</label>
              <input type="date" value={warrantyUntil} onChange={e => setWarrantyUntil(e.target.value)}
                className="w-full bg-bg border border-edge rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus:border-accent" />
            </div>
          </div>
          <div>
            <label className="text-muted text-xs uppercase tracking-wider mb-1 block">Anteckning</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full bg-bg border border-edge rounded-lg px-3 py-2 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent" />
          </div>
          <button type="submit" disabled={saving} className="bg-accent text-bg text-sm font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50">
            {saving ? 'Sparar...' : 'Spara objekt'}
          </button>
        </form>
      )}

      {items.length === 0 && !addingItem && (
        <div className="bg-card border border-edge rounded-2xl p-10 text-center">
          <div className="text-4xl mb-3">📋</div>
          <div className="font-medium mb-1">Inga objekt ännu</div>
          <div className="text-muted text-sm">Lägg till det första — t.ex. värmesystemet</div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {items.map(item => {
          const itemEvents = events.filter(e => e.item_id === item.id)
          const isOpen = expanded === item.id
          return (
            <div key={item.id} className="bg-card border border-edge rounded-xl overflow-hidden">
              <button
                onClick={() => setExpanded(isOpen ? null : item.id)}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-bg/40 transition-colors"
              >
                <div>
                  <div className="font-medium text-sm">{item.name}</div>
                  <div className="text-muted text-xs mt-0.5">
                    {item.category}{item.location ? ` · ${item.location}` : ''}{itemEvents.length > 0 ? ` · ${itemEvents.length} loggade händelser` : ''}
                  </div>
                </div>
                <span className="text-muted text-xs">{isOpen ? '▲' : '▼'}</span>
              </button>

              {isOpen && (
                <div className="border-t border-edge p-4 flex flex-col gap-3">
                  {(item.purchase_date || item.warranty_until || item.notes) && (
                    <div className="text-xs text-muted flex flex-col gap-1">
                      {item.purchase_date && <span>Inköpt: {fmtDate(item.purchase_date)}</span>}
                      {item.warranty_until && <span>Garanti t.o.m.: {fmtDate(item.warranty_until)}</span>}
                      {item.notes && <span>{item.notes}</span>}
                    </div>
                  )}

                  <EventList itemEvents={itemEvents} onAdd={(title, date, cost, notes) => addEvent(item.id, title, date, cost, notes)} onDelete={deleteEvent} />

                  <button onClick={() => deleteItem(item.id)} className="text-red-400 text-xs self-start hover:underline">
                    Ta bort objekt
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function EventList({ itemEvents, onAdd, onDelete }: {
  itemEvents: Event[]
  onAdd: (title: string, date: string, cost: string, notes: string) => void
  onDelete: (id: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [cost, setCost] = useState('')
  const [notes, setNotes] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    onAdd(title, date, cost, notes)
    setTitle(''); setDate(''); setCost(''); setNotes(''); setAdding(false)
  }

  return (
    <div className="flex flex-col gap-2">
      {itemEvents.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {itemEvents.map(ev => (
            <div key={ev.id} className="flex items-center justify-between bg-bg rounded-lg px-3 py-2 text-xs">
              <div>
                <span className="text-fg">{ev.title}</span>
                <span className="text-muted ml-2">{fmtDate(ev.event_date)}{ev.cost ? ` · ${ev.cost} kr` : ''}</span>
              </div>
              <button onClick={() => onDelete(ev.id)} className="text-red-400 hover:underline">Ta bort</button>
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <form onSubmit={submit} className="flex flex-col gap-2 bg-bg rounded-lg p-3">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Vad hände? T.ex. Bytte filter" required
            className="bg-card border border-edge rounded-lg px-3 py-1.5 text-xs text-fg placeholder-muted focus:outline-none focus:border-accent" />
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} required
              className="bg-card border border-edge rounded-lg px-3 py-1.5 text-xs text-fg focus:outline-none focus:border-accent" />
            <input type="number" value={cost} onChange={e => setCost(e.target.value)} placeholder="Kostnad kr"
              className="bg-card border border-edge rounded-lg px-3 py-1.5 text-xs text-fg placeholder-muted focus:outline-none focus:border-accent" />
          </div>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anteckning (valfritt)"
            className="bg-card border border-edge rounded-lg px-3 py-1.5 text-xs text-fg placeholder-muted focus:outline-none focus:border-accent" />
          <div className="flex gap-2">
            <button type="submit" className="text-xs bg-accent text-bg font-semibold px-3 py-1.5 rounded-lg">Spara</button>
            <button type="button" onClick={() => setAdding(false)} className="text-xs text-muted px-3 py-1.5">Avbryt</button>
          </div>
        </form>
      ) : (
        <button onClick={() => setAdding(true)} className="text-accent text-xs self-start hover:underline">+ Logga händelse</button>
      )}
    </div>
  )
}
