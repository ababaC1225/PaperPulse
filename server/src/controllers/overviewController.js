import { optionalConference, optionalYear } from '../lib/paperQuery.js'

export function createGetOverviewStats({ repository }) {
  return function getOverviewStats(request, response, next) {
    try {
      response.json(repository.getOverviewStats({
        conference: optionalConference(request.query.conference),
        year: optionalYear(request.query.year)
      }))
    } catch (error) { next(error) }
  }
}
