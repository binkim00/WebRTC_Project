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
}

function FieldFrame({
  id,
  label,
  required,
  error,
  helperText,
  children,
  className,
}: FieldFrameProps) {
  return (
    <div className={cn('grid gap-1.5 text-left', className)}>
      <label className="text-sm font-semibold text-slate-800" htmlFor={id}>
        {label}
        {required ? <span className="ml-1 text-red-600">*</span> : null}
      </label>
      {children}
      {error ? (
        <p className="text-sm text-red-600" id={`${id}-error`}>
          {error}
        </p>
      ) : helperText ? (
        <p className="text-sm text-slate-500" id={`${id}-help`}>
          {helperText}
        </p>
      ) : null}
    </div>
  )
}

const fieldClassName = cn(
  'min-h-10 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-950 shadow-sm transition',
  'placeholder:text-slate-400 focus:outline-none focus:ring-2',
  'disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500',
)

export type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  label: ReactNode
  error?: string
  helperText?: string
  containerClassName?: string
}

export function TextField({
  id: providedId,
  label,
  error,
  helperText,
  containerClassName,
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
    >
      <input
        aria-describedby={cn(ariaDescribedBy, descriptionId) || undefined}
        aria-invalid={Boolean(error)}
        className={cn(
          fieldClassName,
          error
            ? 'border-red-500 focus:border-red-500 focus:ring-red-200'
            : 'border-slate-300 focus:border-violet-500 focus:ring-violet-200',
          className,
        )}
        id={id}
        required={required}
        {...props}
      />
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
          error
            ? 'border-red-500 focus:border-red-500 focus:ring-red-200'
            : 'border-slate-300 focus:border-violet-500 focus:ring-violet-200',
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
}

export function Select({
  id: providedId,
  label,
  options,
  placeholder,
  error,
  helperText,
  containerClassName,
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
    >
      <select
        aria-describedby={cn(ariaDescribedBy, descriptionId) || undefined}
        aria-invalid={Boolean(error)}
        className={cn(
          fieldClassName,
          error
            ? 'border-red-500 focus:border-red-500 focus:ring-red-200'
            : 'border-slate-300 focus:border-violet-500 focus:ring-violet-200',
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
  ...props
}: CheckboxProps) {
  const generatedId = useId()
  const id = providedId ?? generatedId

  return (
    <div className="grid gap-1">
      <label className="flex cursor-pointer items-start gap-3" htmlFor={id}>
        <input
          aria-describedby={description ? `${id}-description` : undefined}
          aria-invalid={Boolean(error)}
          className={cn(
            'mt-0.5 size-4 rounded border-slate-300 accent-violet-700',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-45',
            className,
          )}
          id={id}
          type="checkbox"
          {...props}
        />
        <span>
          <span className="block text-sm font-medium text-slate-800">{label}</span>
          {description ? (
            <span className="mt-0.5 block text-sm text-slate-500" id={`${id}-description`}>
              {description}
            </span>
          ) : null}
        </span>
      </label>
      {error ? <p className="pl-7 text-sm text-red-600">{error}</p> : null}
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
      <div className={cn(appearance === 'button' ? 'grid gap-2 sm:grid-cols-3' : 'grid gap-3')}>
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
                    'peer-checked:border-violet-600 peer-checked:bg-violet-50 peer-checked:ring-1 peer-checked:ring-violet-600',
                  appearance === 'button' &&
                    'peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-violet-500 peer-focus-visible:ring-offset-2',
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
