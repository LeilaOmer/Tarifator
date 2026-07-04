'use client'

type UsageInfo = { calcule: number; limit: number; show: boolean }

type Props = {
  validCount: number
  saving: boolean
  draftSaved: boolean
  usageInfo: UsageInfo | null
  onExportContabil: () => void
  onExportMagazin: () => void
}

export default function ExportBar({ validCount, saving, draftSaved, usageInfo, onExportContabil, onExportMagazin }: Props) {
  if (validCount === 0) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3">
      <div className="max-w-2xl mx-auto space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">
            {validCount} produs{validCount !== 1 ? 'e' : ''} cu pret calculat
          </p>
          {usageInfo?.show && (
            <p className={`text-xs font-semibold ${usageInfo.calcule >= usageInfo.limit ? 'text-red-500' : 'text-gray-500'}`}>
              {usageInfo.calcule}/{usageInfo.limit} calcule luna aceasta
            </p>
          )}
        </div>
        {saving && <p className="text-xs text-center text-gray-500">Se salveaza...</p>}
        {draftSaved && <p className="text-xs text-center text-green-600">Salvat!</p>}
        <div className="flex gap-3">
          <button onClick={onExportContabil}
            className="flex-1 py-3.5 bg-blue-600 text-white font-bold rounded-xl text-sm">
            PDF Contabil
          </button>
          <button onClick={onExportMagazin}
            className="flex-1 py-3.5 bg-green-600 text-white font-bold rounded-xl text-sm">
            PDF Magazin
          </button>
        </div>
      </div>
    </div>
  )
}
