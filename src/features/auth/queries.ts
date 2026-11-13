import { useMutation } from '@tanstack/react-query'
import { signIn } from './api.ts'

export function useSignIn() {
  return useMutation({ mutationFn: signIn })
}
