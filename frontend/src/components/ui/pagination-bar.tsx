import { useTranslation } from 'react-i18next'
import { Button } from './button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select'

type Props = {
  total: number
  page: number
  pageSize: number  // 0 = all
  onPage: (p: number) => void
  onPageSize: (s: number) => void
}

export function PaginationBar({ total, page, pageSize, onPage, onPageSize }: Props) {
  const { t } = useTranslation()
  const pageCount = pageSize === 0 ? 1 : Math.ceil(total / pageSize)
  const from = total === 0 ? 0 : pageSize === 0 ? 1 : (page - 1) * pageSize + 1
  const to   = pageSize === 0 ? total : Math.min(page * pageSize, total)

  return (
    <div className='flex items-center flex-wrap gap-x-3 gap-y-1.5 text-xs text-muted-foreground'>
      <Select value={String(pageSize)} onValueChange={v => { onPageSize(Number(v)); onPage(1) }}>
        <SelectTrigger className='h-7 text-xs w-[130px]'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='10'>{t('pagination.10')}</SelectItem>
          <SelectItem value='50'>{t('pagination.50')}</SelectItem>
          <SelectItem value='100'>{t('pagination.100')}</SelectItem>
          <SelectItem value='0'>{t('pagination.all')}</SelectItem>
        </SelectContent>
      </Select>
      <span className='shrink-0 tabular-nums'>{t('pagination.showing', { from, to, total })}</span>
      <Button variant='ghost' size='sm' className='h-7 px-2 text-xs' disabled={page <= 1} onClick={() => onPage(page - 1)}>
        {t('pagination.prev')}
      </Button>
      <Button variant='ghost' size='sm' className='h-7 px-2 text-xs' disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
        {t('pagination.next')}
      </Button>
    </div>
  )
}
