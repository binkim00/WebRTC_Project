import {
  useId,
  useState,
  type ButtonHTMLAttributes,
  type FormEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { Button } from './Button'
import { cn } from './cn'

type FieldFrameProps = {
  id: string
  label: ReactNode
  required?: boolean
  error?: string
  helperText?: string
  children: ReactNode
  className?: string
  reserveMessageSpace?: boolean
}

function FieldFrame({
  id,
  label,
  required,
  error,
  helperText,
  children,
  className,
  reserveMessageSpace,
}: FieldFrameProps) {
  return (
    <div className={cn('grid gap-[var(--space-field-gap)] text-left', className)}>
      <label className="text-sm font-semibold text-[var(--color-text-primary)]" htmlFor={id}>
        {label}
        {required ? <span className="ml-1 text-[var(--color-error)]">*</span> : null}
      </label>
      {children}
      {error ? (
        <p className="min-h-4 text-xs text-[var(--color-error)]" id={`${id}-error`}>
          {error}
        </p>
      ) : helperText ? (
        <p className="text-sm text-[var(--color-text-secondary)]" id={`${id}-help`}>
          {helperText}
        </p>
      ) : reserveMessageSpace ? (
        <span aria-hidden className="block min-h-4" />
      ) : null}
    </div>
  )
}

const fieldClassName = cn(
  'min-h-[var(--control-height)] w-full rounded-[var(--radius-control)] border bg-[var(--color-surface-panel)] px-[var(--input-padding-inline)] py-2 text-sm text-[var(--color-text-primary)]',
  'placeholder:text-[var(--color-text-secondary)] transition-[background-color,border-color,box-shadow] duration-200',
  'focus:outline-none focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus-indigo)] focus-visible:[outline-offset:var(--focus-ring-offset)]',
  'disabled:cursor-not-allowed disabled:bg-[var(--color-surface-page)] disabled:text-[var(--color-text-tertiary)]',
)

const fieldStateClasses = {
  default: 'border-[var(--color-border-control)] focus:border-[var(--color-primary-coral)]',
  error: 'border-[var(--color-error)] focus:border-[var(--color-error)]',
} as const

export type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  label: ReactNode
  error?: string
  helperText?: string
  containerClassName?: string
  endAdornment?: ReactNode
  reserveMessageSpace?: boolean
}

export function TextField({
  id: providedId,
  label,
  error,
  helperText,
  containerClassName,
  endAdornment,
  reserveMessageSpace,
  className,
  required,
  'aria-describedby': ariaDescribedBy,
  ...props
}: TextFieldProps) {
  const generatedId = useId()
  const id = providedId ?? generatedId
  const descriptionId = error ? `${id}-error` : helperText ? `${id}-help` : undefined

  return (
    <FieldFrame
      className={containerClassName}
      error={error}
      helperText={helperText}
      id={id}
      label={label}
      required={required}
      reserveMessageSpace={reserveMessageSpace}
    >
      <div className="relative">
        <input
          aria-describedby={cn(ariaDescribedBy, descriptionId) || undefined}
          aria-invalid={Boolean(error)}
          className={cn(
            fieldClassName,
            endAdornment ? 'pr-12' : undefined,
            error ? fieldStateClasses.error : fieldStateClasses.default,
            className,
          )}
          id={id}
          required={required}
          {...props}
        />
        {endAdornment ? (
          <div className="absolute inset-y-0 right-1 flex items-center">{endAdornment}</div>
        ) : null}
      </div>
    </FieldFrame>
  )
}

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: ReactNode
  error?: string
  helperText?: string
  containerClassName?: string
}

export function Textarea({
  id: providedId,
  label,
  error,
  helperText,
  containerClassName,
  className,
  required,
  rows = 4,
  'aria-describedby': ariaDescribedBy,
  ...props
}: TextareaProps) {
  const generatedId = useId()
  const id = providedId ?? generatedId
  const descriptionId = error ? `${id}-error` : helperText ? `${id}-help` : undefined

  return (
    <FieldFrame
      className={containerClassName}
      error={error}
      helperText={helperText}
      id={id}
      label={label}
      required={required}
    >
      <textarea
        aria-describedby={cn(ariaDescribedBy, descriptionId) || undefined}
        aria-invalid={Boolean(error)}
        className={cn(
          fieldClassName,
          'resize-y',
          error ? fieldStateClasses.error : fieldStateClasses.default,
          className,
        )}
        id={id}
        required={required}
        rows={rows}
        {...props}
      />
    </FieldFrame>
  )
}

export type SearchFieldProps = Omit<TextFieldProps, 'type'> & {
  buttonLabel?: string
  onSearch?: (query: string) => void
  formClassName?: string
}

export function SearchField({
  buttonLabel = '검색',
  onSearch,
  formClassName,
  name,
  ...props
}: SearchFieldProps) {
  const generatedName = useId()
  const fieldName = name ?? `search-${generatedName}`

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    onSearch?.(String(formData.get(fieldName) ?? ''))
  }

  return (
    <form className={cn('flex items-end gap-2', formClassName)} onSubmit={handleSubmit} role="search">
      <TextField containerClassName="min-w-0 flex-1" name={fieldName} type="search" {...props} />
      <Button type="submit">{buttonLabel}</Button>
    </form>
  )
}

export type SelectOption = {
  value: string
  label: string
  disabled?: boolean
}

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: ReactNode
  options: readonly SelectOption[]
  placeholder?: string
  error?: string
  helperText?: string
  containerClassName?: string
  reserveMessageSpace?: boolean
}

export function Select({
  id: providedId,
  label,
  options,
  placeholder,
  error,
  helperText,
  containerClassName,
  reserveMessageSpace,
  className,
  required,
  'aria-describedby': ariaDescribedBy,
  ...props
}: SelectProps) {
  const generatedId = useId()
  const id = providedId ?? generatedId
  const descriptionId = error ? `${id}-error` : helperText ? `${id}-help` : undefined

  return (
    <FieldFrame
      className={containerClassName}
      error={error}
      helperText={helperText}
      id={id}
      label={label}
      required={required}
      reserveMessageSpace={reserveMessageSpace}
    >
      <select
        aria-describedby={cn(ariaDescribedBy, descriptionId) || undefined}
        aria-invalid={Boolean(error)}
        className={cn(
          fieldClassName,
          error ? fieldStateClasses.error : fieldStateClasses.default,
          className,
        )}
        id={id}
        required={required}
        {...props}
      >
        {placeholder ? (
          <option disabled value="">
            {placeholder}
          </option>
        ) : null}
        {options.map((option) => (
          <option disabled={option.disabled} key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldFrame>
  )
}

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: ReactNode
  description?: string
  error?: string
}

export function Checkbox({
  id: providedId,
  label,
  description,
  error,
  className,
  disabled,
  'aria-describedby': ariaDescribedBy,
  ...props
}: CheckboxProps) {
  const generatedId = useId()
  const id = providedId ?? generatedId
  const descriptionId = description ? `${id}-description` : undefined
  const errorId = error ? `${id}-error` : undefined

  return (
    <div className="grid gap-[var(--space-field-gap)]">
      <label
        className={cn(
          'flex items-start gap-[var(--space-control-gap)]',
          disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer',
        )}
        htmlFor={id}
      >
        <input
          aria-describedby={cn(ariaDescribedBy, descriptionId, errorId) || undefined}
          aria-invalid={Boolean(error)}
          className={cn(
            'mt-0.5 size-5 shrink-0 rounded-[6px] border-[var(--color-border-control)] accent-[var(--color-primary-coral)]',
            'focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus-indigo)] focus-visible:[outline-offset:var(--focus-ring-offset)]',
            'disabled:cursor-not-allowed',
            className,
          )}
          disabled={disabled}
          id={id}
          type="checkbox"
          {...props}
        />
        <span>
          <span className="block text-sm font-medium text-[var(--color-text-primary)]">{label}</span>
          {description ? (
            <span className="mt-0.5 block text-sm text-[var(--color-text-secondary)]" id={descriptionId}>
              {description}
            </span>
          ) : null}
        </span>
      </label>
      {error ? (
        <p className="pl-[30px] text-sm text-[var(--color-error)]" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  )
}

export type RadioOption = {
  value: string
  label: ReactNode
  description?: string
  disabled?: boolean
}

export type RadioGroupProps = {
  legend: ReactNode
  name: string
  options: readonly RadioOption[]
  appearance?: 'default' | 'button'
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  disabled?: boolean
  required?: boolean
  error?: string
  className?: string
}

export function RadioGroup({
  legend,
  name,
  options,
  appearance = 'default',
  value,
  defaultValue,
  onValueChange,
  disabled,
  required,
  error,
  className,
}: RadioGroupProps) {
  const groupId = useId()

  return (
    <fieldset
      aria-describedby={error ? `${groupId}-error` : undefined}
      className={cn('grid gap-3', className)}
      disabled={disabled}
    >
      <legend className="text-sm font-semibold text-slate-800">
        {legend}
        {required ? <span className="ml-1 text-red-600">*</span> : null}
      </legend>
      <div className={cn(appearance === 'button' ? 'grid gap-2 sm:grid-cols-2' : 'grid gap-3')}>
        {options.map((option) => {
          const optionId = `${groupId}-${option.value}`
          return (
            <label
              className={cn(
                'cursor-pointer',
                appearance === 'default' && 'flex items-start gap-3',
                option.disabled && 'cursor-not-allowed opacity-45',
              )}
              htmlFor={optionId}
              key={option.value}
            >
              <input
                checked={value === undefined ? undefined : value === option.value}
                className={cn(
                  appearance === 'button'
                    ? 'peer sr-only'
                    : 'mt-0.5 size-4 accent-violet-700 focus-visible:ring-2 focus-visible:ring-violet-500',
                )}
                defaultChecked={value === undefined ? defaultValue === option.value : undefined}
                disabled={option.disabled}
                id={optionId}
                name={name}
                onChange={() => onValueChange?.(option.value)}
                required={required}
                type="radio"
                value={option.value}
              />
              <span
                className={cn(
                  appearance === 'button' &&
                    'block h-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-center transition',
                  appearance === 'button' &&
                    'peer-checked:border-[var(--color-primary-coral)] peer-checked:bg-[var(--color-primary-coral-soft)] peer-checked:ring-1 peer-checked:ring-[var(--color-primary-coral)]',
                  appearance === 'button' &&
                    'peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--color-focus-indigo)] peer-focus-visible:ring-offset-2',
                )}
              >
                <span className="block text-sm font-semibold text-slate-800">{option.label}</span>
                {option.description ? (
                  <span className="mt-1 block text-xs leading-5 text-slate-500">
                    {option.description}
                  </span>
                ) : null}
              </span>
            </label>
          )
        })}
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </fieldset>
  )
}

export type SwitchProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'role' | 'aria-checked' | 'onChange'
> & {
  checked: boolean
  onCheckedChange?: (checked: boolean) => void
  label: ReactNode
  description?: string
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  className,
  disabled,
  ...props
}: SwitchProps) {
  const switchId = useId()

  return (
    <div className={cn('flex items-start justify-between gap-4', disabled && 'opacity-50')}>
      <span>
        <span className="block text-sm font-medium text-slate-800" id={`${switchId}-label`}>
          {label}
        </span>
        {description ? (
          <span className="mt-0.5 block text-sm text-slate-500" id={`${switchId}-description`}>
            {description}
          </span>
        ) : null}
      </span>
      <button
        aria-checked={checked}
        aria-describedby={description ? `${switchId}-description` : undefined}
        aria-labelledby={`${switchId}-label`}
        className={cn(
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2',
          checked ? 'bg-violet-700' : 'bg-slate-300',
          disabled && 'cursor-not-allowed',
          className,
        )}
        disabled={disabled}
        onClick={() => onCheckedChange?.(!checked)}
        role="switch"
        type="button"
        {...props}
      >
        <span
          aria-hidden="true"
          className={cn(
            'absolute top-0.5 size-5 rounded-full bg-white shadow transition',
            checked ? 'left-5.5' : 'left-0.5',
          )}
        />
      </button>
    </div>
  )
}

export type SliderProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: ReactNode
  showValue?: boolean
  containerClassName?: string
}

export function Slider({
  id: providedId,
  label,
  showValue = true,
  containerClassName,
  className,
  value,
  defaultValue,
  min = 0,
  max = 100,
  onChange,
  ...props
}: SliderProps) {
  const generatedId = useId()
  const id = providedId ?? generatedId
  const [internalValue, setInternalValue] = useState(defaultValue ?? min)
  const displayValue = value ?? internalValue

  return (
    <div className={cn('grid gap-2', containerClassName)}>
      <div className="flex items-center justify-between gap-4">
        <label className="text-sm font-semibold text-slate-800" htmlFor={id}>
          {label}
        </label>
        {showValue ? <output className="text-sm text-slate-500">{String(displayValue)}</output> : null}
      </div>
      <input
        className={cn(
          'h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-violet-700',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-45',
          className,
        )}
        defaultValue={defaultValue}
        id={id}
        max={max}
        min={min}
        onChange={(event) => {
          setInternalValue(event.currentTarget.value)
          onChange?.(event)
        }}
        type="range"
        value={value}
        {...props}
      />
    </div>
  )
}
